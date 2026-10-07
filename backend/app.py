"""
AI Wallet Guard - Flask backend.

The backend:
1. Classifies and decodes a prepared transaction.
2. Applies deterministic security rules.
3. Generates a short AI explanation (or a safe demo explanation).
4. Stores only a fingerprint of the analysis on the Sepolia audit contract.
"""

import hashlib
import json
import os
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from web3 import Web3
from werkzeug.exceptions import HTTPException

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")

# ----------------------------- configuration -----------------------------

REQUIRED = ["RPC_URL", "PRIVATE_KEY", "CONTRACT_ADDRESS"]
missing = [name for name in REQUIRED if not os.getenv(name)]
if missing:
    raise SystemExit(
        "Missing in backend/.env: " + ", ".join(missing) +
        ". Copy .env.example to .env and fill it in."
    )

RPC_URL = os.getenv("RPC_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
EXPLORER_URL = os.getenv(
    "EXPLORER_URL", "https://sepolia.etherscan.io"
).rstrip("/")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

API_KEY = os.getenv("API_KEY", "")
AI_BASE_URL = os.getenv(
    "AI_BASE_URL", "https://api.openai.com/v1"
).rstrip("/")
AI_MODEL = os.getenv("AI_MODEL", "")

# Easy-to-change security thresholds.
HIGH_VALUE_ETH = Decimal(os.getenv("HIGH_VALUE_ETH", "0.5"))

# Common EVM function selectors.
APPROVE_SELECTOR = "0x095ea7b3"          # approve(address,uint256)
SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465"  # setApprovalForAll(address,bool)
TRANSFER_FROM_SELECTOR = "0x23b872dd"   # transferFrom(address,address,uint256)
SAFE_TRANSFER_FROM_SELECTOR = "0x42842e0e"
SAFE_TRANSFER_FROM_DATA_SELECTOR = "0xb88d4fde"

# A tiny local list. Add only addresses whose identity is actually known.
# The deployed AI Wallet Guard audit contract is known automatically below.
KNOWN_ADDRESSES = {}

# ----------------------------- app + blockchain --------------------------

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": FRONTEND_ORIGIN}})

w3 = Web3(Web3.HTTPProvider(RPC_URL))
if not w3.is_connected():
    raise SystemExit("Unable to connect to RPC_URL.")

account = w3.eth.account.from_key(PRIVATE_KEY)
CONTRACT_ADDRESS = Web3.to_checksum_address(CONTRACT_ADDRESS)

with open(HERE / "abi.json", encoding="utf-8") as f:
    contract = w3.eth.contract(
        address=CONTRACT_ADDRESS,
        abi=json.load(f),
    )

KNOWN_ADDRESSES[CONTRACT_ADDRESS.lower()] = "AI Wallet Guard Audit Registry"

# ----------------------------- helpers -----------------------------------

def normalize_data(data):
    """Normalize transaction calldata to a lowercase 0x-prefixed string."""
    if data is None or data == "":
        return "0x"
    value = str(data).strip()
    if not value.startswith("0x"):
        value = "0x" + value
    if len(value) % 2 != 0:
        raise ValueError("Transaction data must contain complete hex bytes.")
    try:
        bytes.fromhex(value[2:])
    except ValueError as exc:
        raise ValueError("Transaction data must be valid hexadecimal.") from exc
    return value.lower()


def parse_eth_value(value):
    """Parse the ETH value supplied by the frontend."""
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("Value must be a valid ETH amount.") from exc

    if amount < 0:
        raise ValueError("Value cannot be negative.")
    return amount


def validate_address(address, field_name):
    """Validate an Ethereum address and return its checksum form."""
    if not address or not Web3.is_address(address):
        raise ValueError(f"{field_name} must be a valid Ethereum address.")
    return Web3.to_checksum_address(address)


def selector(data):
    """Return the first four-byte function selector from calldata."""
    if not data or data == "0x" or len(data) < 10:
        return ""
    return data[:10].lower()


def word(data, index):
    """Read a 32-byte ABI word from calldata by zero-based word index."""
    start = 10 + index * 64
    end = start + 64
    if len(data) < end:
        return None
    return data[start:end]


def decode_address_word(value):
    """Decode an ABI-encoded address word."""
    if not value:
        return None
    return Web3.to_checksum_address("0x" + value[-40:])


def decode_bool_word(value):
    """Decode a simple ABI boolean word."""
    if not value:
        return None
    return int(value, 16) != 0


def decode_uint_word(value):
    """Decode a simple ABI uint256 word."""
    if not value:
        return None
    return int(value, 16)


def classify_transaction(data, value_eth):
    """Classify the prepared transaction using deterministic selectors."""
    sel = selector(data)

    if data == "0x":
        if value_eth > 0:
            return "transfer", "ETH transfer", {}
        return "transfer", "Zero-value ETH transfer", {}

    if sel == APPROVE_SELECTOR:
        spender = decode_address_word(word(data, 0))
        amount = decode_uint_word(word(data, 1))
        unlimited = amount == (2**256 - 1) if amount is not None else False
        return "approval", "Token approval", {
            "approvalSpender": spender,
            "approvalAmount": str(amount) if amount is not None else None,
            "unlimitedApproval": unlimited,
        }

    if sel == SET_APPROVAL_FOR_ALL_SELECTOR:
        operator = decode_address_word(word(data, 0))
        approved = decode_bool_word(word(data, 1))
        return "approval", "NFT approval", {
            "approvalSpender": operator,
            "approvalAmount": "unlimited" if approved else "revoked",
            "unlimitedApproval": approved,
        }

    if sel in {
        TRANSFER_FROM_SELECTOR,
        SAFE_TRANSFER_FROM_SELECTOR,
        SAFE_TRANSFER_FROM_DATA_SELECTOR,
    }:
        return "nft", "NFT transfer", {
            "transferSelector": sel,
        }

    return "contract_call", "General contract call", {
        "functionSelector": sel,
    }


def known_recipient(address):
    """Return a local label for a known recipient, if one exists."""
    label = KNOWN_ADDRESSES.get(address.lower())
    if label:
        return True, label
    return False, "Unknown address"


def calculate_risk(tx_type, value_eth, known, decoded):
    """Apply mandatory deterministic security rules before AI is called."""
    warnings = []
    risk = "LOW"

    unknown = not known
    high_value = value_eth >= HIGH_VALUE_ETH
    unlimited = bool(decoded.get("unlimitedApproval"))

    if unknown:
        warnings.append("The recipient is not in the trusted address list.")
        risk = "MEDIUM"

    if high_value:
        warnings.append(
            f"The transaction value is unusually high (>= {HIGH_VALUE_ETH} ETH)."
        )
        risk = "HIGH"

    if tx_type == "approval" and unlimited:
        warnings.append(
            "This transaction requests an unlimited token/NFT approval."
        )
        risk = "HIGH"

    if tx_type == "approval" and unknown:
        warnings.append(
            "This approval targets an unknown contract."
        )
        risk = "HIGH"

    if tx_type == "contract_call" and unknown:
        warnings.append(
            "This is a contract interaction with an unknown recipient."
        )
        risk = "MEDIUM" if risk != "HIGH" else risk

    warning = " ".join(warnings)
    return risk, warning


def fallback_explanation(tx_type, value_eth, known, risk, decoded):
    """Create a deterministic demo explanation when no AI key is configured."""
    if tx_type == "transfer":
        if risk == "HIGH":
            return (
                f"You are sending {value_eth:g} ETH to an address that is not trusted "
                "by this demo. The amount is unusually high, so verify the recipient carefully."
            )
        if known:
            return f"You are sending {value_eth:g} ETH to a known address. Check the amount before signing."
        return (
            f"You are sending {value_eth:g} ETH to an address that is not in the trusted list. "
            "Make sure you recognize the recipient before signing."
        )

    if tx_type == "approval":
        spender = decoded.get("approvalSpender") or "this contract"
        if decoded.get("unlimitedApproval"):
            return (
                f"You are giving {spender} permission to spend your tokens without a fixed limit. "
                "Only continue if you fully trust this contract."
            )
        return (
            f"You are giving {spender} permission to act on your tokens. "
            "Only continue if you recognize the contract."
        )

    if tx_type == "nft":
        return (
            "You are transferring an NFT to another address or contract. "
            "Make sure the destination and action are correct before signing."
        )

    return (
        "You are interacting with a smart contract rather than making a simple ETH transfer. "
        "Review the recipient and transaction details carefully before signing."
    )


def limit_sentences(text, maximum=3):
    """Limit an AI response to a maximum number of sentences."""
    cleaned = re.sub(r"\s+", " ", str(text)).strip()
    if not cleaned:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    return " ".join(parts[:maximum]).strip()


def ai_explanation(tx_type, recipient, value_eth, decoded_action, risk,
                   known, warning, decoded):
    """Ask an OpenAI-compatible provider for a short explanation."""
    fallback = fallback_explanation(
        tx_type, value_eth, known, risk, decoded
    )

    if not API_KEY or not AI_MODEL:
        return fallback, True

    prompt = {
        "transactionType": tx_type,
        "recipient": recipient,
        "valueEth": str(value_eth),
        "decodedAction": decoded_action,
        "risk": risk,
        "recipientKnown": known,
        "warning": warning,
        "approvalSpender": decoded.get("approvalSpender"),
        "unlimitedApproval": decoded.get("unlimitedApproval", False),
    }

    system = (
        "You explain blockchain wallet transactions to non-technical users. "
        "Return only a simple explanation in at most 3 sentences. "
        "Do not change or downgrade the supplied risk level. "
        "Do not use Solidity or ABI jargon as the main explanation. "
        "Mention the important warning when one exists."
    )

    try:
        response = requests.post(
            f"{AI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(prompt)},
                ],
                "temperature": 0.2,
            },
            timeout=30,
        )
        if not response.ok:
            return fallback, True

        content = response.json()["choices"][0]["message"]["content"]
        explanation = limit_sentences(content, 3)
        return explanation or fallback, False
    except (requests.RequestException, KeyError, TypeError, ValueError):
        return fallback, True


def analysis_hash(payload):
    """Create a deterministic SHA-256 fingerprint of the analysis."""
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return "0x" + hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def tx_url(tx_hash):
    """Build a Sepolia explorer URL for a transaction."""
    return f"{EXPLORER_URL}/tx/{tx_hash}"


def record_audit_on_chain(analysis_hash_hex, tx_type, risk):
    """Record only the analysis fingerprint and minimal metadata on-chain."""
    existing =contract.functions.analyses(analysis_hash_hex).call()

    if existing[2] != 0:
        return {
            "auditTxHash": None,
            "auditExplorerUrl": None,
            "alreadyRecorded": True,
        } 
    fn = contract.functions.recordAnalysis(
        analysis_hash_hex,
        tx_type,
        risk,
    )

    nonce = w3.eth.get_transaction_count(account.address, "pending")
    gas = fn.estimate_gas({"from": account.address})

    tx = fn.build_transaction({
        "from": account.address,
        "nonce": nonce,
        "chainId": w3.eth.chain_id,
        "gas": int(gas * 1.20),
        "gasPrice": w3.eth.gas_price,
    })

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    if receipt.status != 1:
        raise RuntimeError("The blockchain audit transaction failed.")

    return w3.to_hex(tx_hash)


# ----------------------------- routes ------------------------------------

@app.get("/health")
def health():
    """Return a simple backend health response."""
    return {"ok": True}


@app.post("/analyze-transaction")
def analyze_transaction():
    """Analyze a prepared transaction before the frontend asks MetaMask to sign."""
    body = request.get_json(silent=True) or {}

    try:
        to = validate_address(body.get("to"), "to")
        sender = body.get("from")
        sender = validate_address(sender, "from") if sender else None
        value_eth = parse_eth_value(body.get("value", "0"))
        data = normalize_data(body.get("data", "0x"))

        gas = body.get("gas", "0")
        try:
            gas = int(gas)
            if gas < 0:
                raise ValueError
        except (TypeError, ValueError):
            raise ValueError("gas must be a non-negative integer.")

        tx_type, decoded_action, decoded = classify_transaction(
            data, value_eth
        )
        known, recipient_label = known_recipient(to)

        risk, warning = calculate_risk(
            tx_type, value_eth, known, decoded
        )

        explanation, ai_demo = ai_explanation(
            tx_type=tx_type,
            recipient=to,
            value_eth=value_eth,
            decoded_action=decoded_action,
            risk=risk,
            known=known,
            warning=warning,
            decoded=decoded,
        )

        # This is the only data fingerprinted for the blockchain audit.
        audit_payload = {
            "to": to.lower(),
            "from": sender.lower() if sender else "",
            "value": str(value_eth),
            "data": data,
            "gas": gas,
            "type": tx_type,
            "risk": risk,
            "explanation": explanation,
        }

        fingerprint = analysis_hash(audit_payload)

        try:
            audit_tx_hash = record_audit_on_chain(
                fingerprint, tx_type, risk
            )
        except Exception as exc:
            app.logger.exception("Audit recording failed")
            return jsonify({
                "ok": False,
                "error": "Security analysis completed, but the blockchain audit could not be recorded.",
            }), 503

        return jsonify({
            "ok": True,
            "type": tx_type,
            "risk": risk,
            "recipientKnown": known,
            "recipientLabel": (
                recipient_label if known else "Unknown address"
            ),
            "warning": warning,
            "explanation": explanation,
            "decodedAction": decoded_action,
            "to": to,
            "value": str(value_eth),
            "gas": gas,
            "data": data,
            "aiDemo": ai_demo,
            "analysisHash": fingerprint,
            "auditTxHash": audit_tx_hash,
            "auditExplorerUrl": tx_url(audit_tx_hash),
        })

    except ValueError as exc:
        return jsonify({
            "ok": False,
            "error": str(exc),
        }), 400


@app.errorhandler(Exception)
def handle_error(error):
    """Return JSON errors instead of Flask HTML pages or stack traces."""
    if isinstance(error, HTTPException):
        return jsonify({
            "ok": False,
            "error": error.description,
        }), error.code

    app.logger.exception(error)
    return jsonify({
        "ok": False,
        "error": "Unable to analyze this transaction.",
    }), 500


if __name__ == "__main__":
    """Start the Flask development server."""
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=True,
    )
