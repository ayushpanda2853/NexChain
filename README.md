# NexChain

## AI-Powered Wallet Security for Safer Blockchain Transactions

NexChain is an AI-powered Web3 wallet security assistant built for
**INNOBLOCK 2.0 --- Domain 2: Wallet Security**.

It analyzes a blockchain transaction **before the user signs it**,
explains what the transaction is doing in simple language, calculates a
deterministic risk level, and records a tamper-evident analysis
fingerprint on **Ethereum Sepolia**.

> **Network:** Ethereum Sepolia only\
> **Chain ID:** `11155111`\
> **Project:** NexChain

------------------------------------------------------------------------

## Problem

Blockchain transactions are difficult for many users to understand.

A wallet may display:

-   a hexadecimal contract address
-   encoded calldata
-   token approvals
-   contract interactions
-   large ETH values
-   unfamiliar recipients

Users can therefore approve a malicious or unintended transaction
without understanding its consequences.

### NexChain's solution

NexChain places a security analysis layer **before MetaMask signing**:

``` text
User prepares transaction
        ↓
NexChain analyzes transaction
        ↓
Transaction type detected
        ↓
Risk rules evaluated
        ↓
AI explanation generated
        ↓
Analysis fingerprint recorded on Sepolia
        ↓
User reviews warning
        ↓
MetaMask signing
        ↓
Transaction submitted
```

------------------------------------------------------------------------

# Key Features

### 1. Transaction Classification

NexChain automatically classifies transactions as:

-   `transfer`
-   `approval`
-   `nft`
-   `contract_call`

### 2. Deterministic Risk Detection

Risk is calculated using transparent security rules.

  Condition                         Risk
  --------------------------------- --------
  Normal known transfer             LOW
  Unknown recipient                 MEDIUM
  Unknown contract interaction      MEDIUM
  High-value transfer               HIGH
  Unlimited token approval          HIGH
  Approval to an unknown contract   HIGH

The AI explanation **does not override or downgrade** the deterministic
security decision.

### 3. AI Explanation

Instead of showing only raw calldata, NexChain explains the transaction
in simple language.

Example:

> You are interacting with a smart contract rather than making a simple
> ETH transfer. Review the recipient and transaction details carefully
> before signing.

AI explanations are limited to a maximum of three sentences.

### 4. Pre-Signing Security Gate

The transaction is analyzed before MetaMask is opened.

For HIGH-risk transactions, NexChain requires an additional confirmation
before allowing the user to continue to MetaMask.

### 5. On-Chain Audit Trail

NexChain does **not** store full transaction details on-chain.

Only a SHA-256 analysis fingerprint and minimal metadata are recorded:

``` text
analysisHash
transaction type
risk level
timestamp
```

This provides a tamper-evident audit record while keeping detailed
transaction information off-chain.

------------------------------------------------------------------------

# Architecture

``` text
                 ┌──────────────────────┐
                 │      NexChain UI     │
                 │ HTML / CSS / JS      │
                 │ ethers.js v6         │
                 └──────────┬───────────┘
                            │
                            │ POST /analyze-transaction
                            ▼
                 ┌──────────────────────┐
                 │   Flask Backend      │
                 │      web3.py         │
                 │                      │
                 │ • classification     │
                 │ • decoding           │
                 │ • risk engine        │
                 │ • AI explanation     │
                 │ • fingerprinting     │
                 └───────┬───────┬──────┘
                         │       │
              AI API ────┘       │
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │ Ethereum Sepolia    │
                    │                     │
                    │ RecordRegistry      │
                    │ audit fingerprint   │
                    └─────────────────────┘

                         │
                         ▼
                    ┌─────────────┐
                    │  MetaMask   │
                    │   Signing   │
                    └─────────────┘
```

------------------------------------------------------------------------

# Technology Stack

## Frontend

-   HTML5
-   CSS3
-   JavaScript
-   ethers.js v6
-   MetaMask

## Backend

-   Python
-   Flask
-   Flask-CORS
-   web3.py
-   Requests

## Blockchain

-   Solidity `^0.8.20`
-   Ethereum Sepolia
-   Sepolia Chain ID `11155111`

## AI

The backend supports an OpenAI-compatible chat API.

Example providers can be configured through:

``` env
API_KEY=
AI_BASE_URL=
AI_MODEL=
```

For example, with Groq:

``` env
API_KEY=YOUR_GROQ_API_KEY
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=YOUR_SUPPORTED_GROQ_MODEL
```

**Never commit `.env` to GitHub.**

------------------------------------------------------------------------

# Smart Contract

The NexChain audit registry stores only the analysis fingerprint and
minimal metadata.

### Contract

``` text
RecordRegistry.sol
```

### Deployed Network

``` text
Ethereum Sepolia
Chain ID: 11155111
```

### Contract Address

``` text
0x3f7359990607aa030366281F5C254e75471a2ffec9
```

The contract provides:

``` solidity
recordAnalysis(
    bytes32 analysisHash,
    string txType,
    string risk
)
```

and:

``` solidity
analyses(bytes32)
```

Duplicate analysis fingerprints are rejected.

------------------------------------------------------------------------

# Project Structure

``` text
NexChain/
│
├── backend/
│   ├── app.py
│   ├── abi.json
│   ├── requirements.txt
│   ├── .env.example
│   └── .gitignore
│
├── contracts/
│   └── RecordRegistry.sol
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── config.js
│
├── docs/
│
├── .gitignore
├── LICENSE
└── README.md
```

------------------------------------------------------------------------

# Setup

## 1. Clone the repository

``` bash
git clone https://github.com/ayushpanda2853/NexChain.git
cd NexChain
```

------------------------------------------------------------------------

# 2. Backend Setup

Open a terminal inside the project.

``` powershell
cd backend
```

Create a virtual environment:

``` powershell
python -m venv venv
```

Activate it:

``` powershell
.\venv\Scripts\Activate.ps1
```

Install dependencies:

``` powershell
pip install -r requirements.txt
```

------------------------------------------------------------------------

# 3. Configure Environment Variables

Create:

``` text
backend/.env
```

Use `.env.example` as the template.

Example:

``` env
PRIVATE_KEY=YOUR_SEPOLIA_WALLET_PRIVATE_KEY
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CONTRACT_ADDRESS=0x3f7359990607aa030366281F5C254e75471a2ffec9
EXPLORER_URL=https://sepolia.etherscan.io
FRONTEND_ORIGIN=*
HIGH_VALUE_ETH=0.5

API_KEY=YOUR_AI_API_KEY
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=YOUR_SUPPORTED_MODEL
```

### Important

The private key should belong to a wallet used only for the test/demo
environment.

Do **not** use a mainnet wallet private key.

Do **not** upload `.env` to GitHub.

------------------------------------------------------------------------

# 4. Start the Backend

From the `backend` directory:

``` powershell
.\venv\Scripts\Activate.ps1
python app.py
```

The backend runs on:

``` text
http://localhost:5000
```

Health check:

``` text
http://localhost:5000/health
```

Expected response:

``` json
{
  "ok": true
}
```

------------------------------------------------------------------------

# 5. Start the Frontend

The frontend is a plain HTML/CSS/JavaScript application and does not
require a build system.

From the project root, you can use VS Code Live Server or another local
static server.

Example:

``` text
http://localhost:5500
```

Open the application in a browser with MetaMask installed.

------------------------------------------------------------------------

# Transaction Analysis API

## Endpoint

``` http
POST /analyze-transaction
```

Example request:

``` json
{
  "from": "0xYourWalletAddress",
  "to": "0xRecipientAddress",
  "value": "0.001",
  "data": "0x",
  "gas": "21000"
}
```

The backend returns information such as:

``` json
{
  "ok": true,
  "type": "transfer",
  "risk": "MEDIUM",
  "warning": "The recipient is not in the trusted address list.",
  "explanation": "You are sending ETH to an address that is not in the trusted list. Make sure you recognize the recipient before signing.",
  "analysisHash": "0x..."
}
```

It also returns the on-chain audit transaction when a new analysis is
recorded.

------------------------------------------------------------------------

# Demo Scenarios

NexChain includes demonstration scenarios for the hackathon
presentation.

## Demo 1 --- Low-Risk Transfer

Example:

``` text
Type: transfer
Value: 0.001 ETH
Data: 0x
Gas: 21000
```

The application analyzes the transaction before MetaMask signing.

------------------------------------------------------------------------

## Demo 2 --- High-Risk Transfer

Example:

``` text
Type: transfer
Value: 1 ETH
Recipient: unknown address
```

NexChain identifies the unusually high value and unknown recipient.

The UI displays a HIGH-risk warning and requires confirmation before
MetaMask.

------------------------------------------------------------------------

## Demo 3 --- Contract Interaction

Example:

``` text
Type: contract_call
Value: 0 ETH
Data: 0x11111111
```

NexChain detects that this is a contract interaction rather than a
simple ETH transfer.

------------------------------------------------------------------------

## Demo 4 --- Token Approval

NexChain recognizes common approval selectors such as:

``` text
approve(address,uint256)
setApprovalForAll(address,bool)
```

Unlimited approvals are treated as HIGH risk.

------------------------------------------------------------------------

# Security Design

## Pre-signing analysis

The application does not immediately send the transaction.

The sequence is:

``` text
Prepare
   ↓
Analyze
   ↓
Review
   ↓
Confirm
   ↓
MetaMask
   ↓
Sign
```

This gives the user an opportunity to stop a suspicious transaction.

------------------------------------------------------------------------

## Deterministic security rules

Security-critical risk decisions are based on deterministic rules rather
than allowing an AI model to decide whether a transaction is safe.

This prevents an AI response from silently downgrading a dangerous
transaction.

------------------------------------------------------------------------

## Minimal on-chain storage

The blockchain stores:

``` text
analysis fingerprint
transaction type
risk
timestamp
```

Full transaction information and AI reasoning remain off-chain.

------------------------------------------------------------------------

## Sepolia-only operation

NexChain is intended for hackathon demonstration on:

``` text
Ethereum Sepolia
Chain ID: 11155111
```

Do not use the demonstration wallet or private key with Ethereum
Mainnet.

------------------------------------------------------------------------

# EIP-7702 Compatibility

Some MetaMask accounts may use delegated execution through EIP-7702.

For this reason, the frontend estimates gas before signing instead of
blindly forcing a fixed gas limit.

The application adds a safety margin to the estimated gas limit.

This helps avoid failures caused by delegated accounts requiring more
gas than a basic 21,000-gas ETH transfer.

------------------------------------------------------------------------

# Privacy Model

NexChain follows a hybrid on-chain/off-chain design.

### On-chain

Only:

``` text
analysisHash
transaction type
risk
timestamp
```

### Off-chain

The backend handles:

``` text
transaction details
calldata
decoded parameters
risk analysis
AI explanation
```

This reduces unnecessary blockchain storage while maintaining an
auditable fingerprint.

------------------------------------------------------------------------

# GitHub Security

The repository intentionally excludes secrets.

`.gitignore` contains rules for:

``` text
.env
venv/
__pycache__/
*.pyc
```

Never commit:

``` text
API_KEY
PRIVATE_KEY
```

If a secret is accidentally exposed, revoke/rotate it immediately.

------------------------------------------------------------------------

# API Error Handling

The backend returns JSON errors instead of exposing raw server failures
to the frontend.

Examples include:

-   invalid Ethereum address
-   invalid transaction value
-   malformed calldata
-   missing environment variables
-   blockchain RPC errors
-   AI provider errors
-   duplicate analysis fingerprint

------------------------------------------------------------------------

# Hackathon Demo Flow

A recommended 2--3 minute presentation:

### 1. Introduce the problem

> Blockchain transactions often contain technical information that
> ordinary users cannot easily understand.

### 2. Show NexChain

> NexChain analyzes a transaction before the user signs it.

### 3. Demonstrate a normal transfer

Prepare a low-value transfer and click:

``` text
Analyze Transaction
```

Show the transaction type, risk, warning, AI explanation, and audit
fingerprint.

### 4. Demonstrate a suspicious transaction

Use the high-value unknown-recipient demo.

Show:

``` text
HIGH RISK
```

Explain that the transaction cannot proceed without explicit
confirmation.

### 5. Demonstrate contract interaction

Use the contract-call demo.

Show that NexChain identifies the interaction as:

``` text
contract_call
```

### 6. Show the audit record

Open the Sepolia explorer link and demonstrate that the analysis
fingerprint was recorded on-chain.

### 7. Finish

> NexChain adds an intelligent security layer between the user and
> MetaMask, helping users understand blockchain transactions before they
> sign.

------------------------------------------------------------------------

# Future Improvements

Possible future versions could include:

-   trusted address management
-   phishing and scam-address databases
-   ERC-20 symbol and balance resolution
-   ERC-721/ERC-1155 metadata decoding
-   simulation through an Ethereum execution environment
-   historical wallet behavior analysis
-   transaction simulation and state-diff visualization
-   multi-chain support
-   browser-extension integration
-   mobile wallet integration
-   advanced AI threat explanations

------------------------------------------------------------------------

# Team

## NexChain

Built for:

**INNOBLOCK 2.0**

**Domain:** Wallet Security

**Goal:** Make blockchain transactions easier to understand and safer to
sign.

------------------------------------------------------------------------

# License

This project is provided for hackathon and educational purposes.

See the `LICENSE` file for details.
