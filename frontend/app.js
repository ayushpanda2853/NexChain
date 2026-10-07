/* NexChain - keeps the original MetaMask, Sepolia, backend and signing contract intact. */

let provider = null;
let signer = null;
let walletAddress = null;
let lastAnalysis = null;
let lastAnalyzedTransaction = null;
let progressTimers = [];

const $ = (id) => document.getElementById(id);
const sepolia = () => NETWORKS[ACTIVE_NETWORK] || NETWORKS.sepolia;

function setStatus(message, type = "info") {
  $("status").textContent = message;
  const visibleStatus = $("formStatus");
  visibleStatus.textContent = message;
  visibleStatus.dataset.type = type;
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
}

function formatAmount(value) {
  return `${value} SepoliaETH`;
}

function showModal(id) { $(id).classList.remove("is-hidden"); }
function hideModal(id) { $(id).classList.add("is-hidden"); }

function updateWalletUI() {
  const connected = Boolean(walletAddress);
  $("walletAddress").textContent = connected ? shortAddress(walletAddress) : "Connect wallet";
  $("walletDot").classList.toggle("connected", connected);
  $("connectWallet").setAttribute("aria-label", connected ? `Connected as ${walletAddress}` : "Connect MetaMask wallet");
  $("fromAccount").textContent = connected ? "Connected account" : "Connect MetaMask";
  $("fromAddress").textContent = connected ? shortAddress(walletAddress) : "Your account will appear here";
}

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error("MetaMask is not installed. Install MetaMask, then try again.");
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    if (!accounts.length) throw new Error("No wallet account was selected.");

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== sepolia().chainId) {
      setStatus("Switching MetaMask to Ethereum Sepolia…", "warning");
      await switchToSepolia();
    }

    signer = await provider.getSigner();
    walletAddress = await signer.getAddress();
    updateWalletUI();
    setStatus("Wallet connected. Enter a transaction, then analyze it before signing.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.shortMessage || error.message || "Unable to connect to MetaMask.", "error");
  }
}

async function switchToSepolia() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: sepolia().chainIdHex }] });
  } catch (error) {
    if (error.code !== 4902) throw new Error("Please switch MetaMask to Ethereum Sepolia to continue.");
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: sepolia().chainIdHex, chainName: sepolia().name, nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 }, rpcUrls: [sepolia().rpcUrl], blockExplorerUrls: [sepolia().explorer] }]
    });
  }
  provider = new ethers.BrowserProvider(window.ethereum);
}

function getTransactionFromForm() {
  const to = $("recipient").value.trim();
  const value = $("amount").value.trim();
  const data = $("data").value.trim() || "0x";
  const gas = $("gas").value.trim();

  if (!ethers.isAddress(to)) throw new Error("Enter a valid recipient address.");
  if (!value || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("Enter a valid ETH amount (zero is allowed for a contract call).");
  if (!/^0x([0-9a-fA-F]{2})*$/.test(data)) throw new Error("Transaction data must be hexadecimal calldata beginning with 0x.");
  if (gas && (!Number.isSafeInteger(Number(gas)) || Number(gas) <= 0)) throw new Error("Gas limit must be a positive whole number.");

  return {
    to: ethers.getAddress(to),
    value,
    valueWei: ethers.parseEther(value).toString(),
    data: data.toLowerCase(),
    gas: gas ? Number(gas) : null
  };
}

function sameTransaction(a, b) {
  return a && b && a.to.toLowerCase() === b.to.toLowerCase() && a.valueWei === b.valueWei && a.data === b.data && a.gas === b.gas;
}

function resetAnalysis(message) {
  lastAnalysis = null;
  lastAnalyzedTransaction = null;
  $("signButton").disabled = true;
  hideModal("analysisModal");
  hideModal("handoffModal");
  if (message) setStatus(message, "warning");
}

function startProgress() {
  stopProgress();
  const steps = [...$("analysisSteps").children];
  steps.forEach((step) => step.className = "");
  $("analyzingView").classList.remove("is-hidden");
  $("analysisResultView").classList.add("is-hidden");
  showModal("analysisModal");
  steps[0].classList.add("is-active");
  steps.slice(1).forEach((step, index) => {
    progressTimers.push(window.setTimeout(() => {
      steps[index].classList.remove("is-active");
      steps[index].classList.add("is-complete");
      step.classList.add("is-active");
    }, (index + 1) * 360));
  });
}

function stopProgress(completed = false) {
  progressTimers.forEach(window.clearTimeout);
  progressTimers = [];
  if (completed) [...$("analysisSteps").children].forEach((step) => step.className = "is-complete");
}

function delay(milliseconds) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }

async function analyzeTransaction() {
  try {
    if (!walletAddress || !signer) throw new Error("Connect MetaMask before analyzing a transaction.");
    const transaction = getTransactionFromForm();
    $("analyzeButton").disabled = true;
    $("signButton").disabled = true;
    startProgress();
    setStatus("Analyzing transaction before it can be signed…", "info");

    const request = fetch(`${BACKEND_URL}/analyze-transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: walletAddress, to: transaction.to, value: transaction.value, data: transaction.data, gas: transaction.gas })
    });
    const [response] = await Promise.all([request, delay(1400)]);
    let result;
    try { result = await response.json(); } catch { throw new Error("The analysis service returned an unreadable response."); }
    if (!response.ok || !result.ok) throw new Error(result.error || "Transaction analysis failed.");

    lastAnalysis = result;
    lastAnalyzedTransaction = transaction;
    stopProgress(true);
    displayAnalysis(result, transaction);
    $("signButton").disabled = false;
    setStatus(`Analysis complete: ${String(result.risk || "unknown").toLowerCase()} risk. Review it before signing.`, riskToStatus(result.risk));
  } catch (error) {
    console.error(error);
    stopProgress();
    lastAnalysis = null;
    lastAnalyzedTransaction = null;
    hideModal("analysisModal");
    $("signButton").disabled = true;
    setStatus(error.message || "Transaction analysis failed.", "error");
  } finally {
    $("analyzeButton").disabled = false;
  }
}

function riskToStatus(risk) {
  const value = String(risk || "").toUpperCase();
  return value === "HIGH" ? "error" : value === "MEDIUM" ? "warning" : "success";
}

function riskScore(result) {
  const supplied = Number(result.riskScore ?? result.score);
  if (Number.isFinite(supplied)) return Math.max(0, Math.min(100, Math.round(supplied)));
  return ({ LOW: 20, MEDIUM: 65, HIGH: 90 })[String(result.risk || "").toUpperCase()] ?? 50;
}

function conciseExplanation(explanation, result, transaction) {
  const fallback = `This ${result.type || "transaction"} sends ${transaction.value} ETH to ${shortAddress(transaction.to)}. Review the recipient and warning before you approve it in MetaMask.`;
  const text = String(explanation || fallback).trim();
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.slice(0, 3).join(" ");
}

function makeWarning(result, transaction) {
  const provided = String(result.warning || "").trim();
  if (provided && !/^no additional warning\.?$/i.test(provided)) return provided;
  const warnings = ["This recipient is not in your trusted address list. Verify it independently before signing."];
  if (Number(transaction.value) >= 1) warnings.push("The value is unusually high for a test transaction.");
  return warnings.join(" ");
}

function displayAnalysis(result, transaction) {
  const risk = String(result.risk || "UNKNOWN").toUpperCase();
  const score = riskScore(result);
  const summary = $("riskSummary");
  summary.className = `risk-summary risk-${risk.toLowerCase()}`;
  $("analysisRisk").textContent = `${risk} RISK`;
  $("riskCaption").textContent = risk === "HIGH" ? "Proceed only if you understand the risk" : risk === "LOW" ? "No critical risks detected" : "Proceed with caution";
  $("riskScore").textContent = score;
  $("riskMeter").style.width = `${score}%`;
  $("analysisType").textContent = result.type || "Contract call";
  $("analysisAmount").textContent = formatAmount(transaction.value);
  $("analysisRecipient").textContent = shortAddress(transaction.to);
  $("analysisRecipient").title = transaction.to;
  $("analysisGas").textContent = transaction.gas ?? "Wallet estimate";
  $("analysisData").textContent = transaction.data;
  $("analysisData").title = transaction.data;
  $("analysisWarning").textContent = makeWarning(result, transaction);
  $("analysisExplanation").textContent = conciseExplanation(result.explanation, result, transaction);
  $("analysisHash").textContent = result.analysisHash || "Not available";
  const audit = $("auditLink");
  if (result.auditExplorerUrl) { audit.href = result.auditExplorerUrl; audit.classList.remove("is-hidden"); } else { audit.classList.add("is-hidden"); }
  $("analyzingView").classList.add("is-hidden");
  $("analysisResultView").classList.remove("is-hidden");
}

function openMetaMaskHandoff() {
  try {
    if (!lastAnalysis || !lastAnalyzedTransaction) throw new Error("Analyze this transaction before signing.");
    const current = getTransactionFromForm();
    if (!sameTransaction(current, lastAnalyzedTransaction)) throw new Error("Transaction details changed after analysis. Analyze again before signing.");
    if (String(lastAnalysis.risk || "").toUpperCase() === "HIGH" && !window.confirm(`HIGH-RISK WARNING\n\n${makeWarning(lastAnalysis, current)}\n\nDo you understand the risk and want to continue?`)) {
      setStatus("Signing cancelled. The transaction was not sent.", "warning");
      return;
    }
    $("handoffRecipient").textContent = shortAddress(current.to);
    $("handoffRecipient").title = current.to;
    $("handoffAmount").textContent = formatAmount(current.value);
    hideModal("analysisModal");
    showModal("handoffModal");
    setStatus("Analysis approved. Open MetaMask to confirm the same transaction.", "success");
  } catch (error) {
    setStatus(error.message || "Unable to start signing.", "error");
  }
}

async function signTransaction() {
  try {
    if (!signer || !lastAnalysis || !lastAnalyzedTransaction) throw new Error("Connect, analyze, and review the transaction first.");
    const current = getTransactionFromForm();
    if (!sameTransaction(current, lastAnalyzedTransaction)) throw new Error("Transaction details changed after analysis. Analyze again before signing.");
    $("openMetaMaskButton").disabled = true;
    $("signButton").disabled = true;
    setStatus("Opening MetaMask for transaction confirmation…", "info");
    const txRequest = { to: current.to, value: ethers.parseEther(current.value), data: current.data };
    // Estimate gas automatically for EIP-7702 delegated accounts.
const estimatedGas = await signer.estimateGas(txRequest);

// Add a 20% safety margin.
txRequest.gasLimit = (estimatedGas * 120n) / 100n;

console.log("Estimated gas:", estimatedGas.toString());
console.log("Gas limit used:", txRequest.gasLimit.toString());
    const transaction = await signer.sendTransaction(txRequest);
    hideModal("handoffModal");
    displayTransactionHash(transaction.hash);
    showModal("submittedModal");
    setStatus(`Transaction submitted: ${transaction.hash}`, "success");

    const receipt = await transaction.wait();
    hideModal("submittedModal");
    if (receipt.status === 1) {
      displayConfirmation(transaction.hash, receipt.blockNumber);
      setStatus("Transaction confirmed successfully on Sepolia.", "success");
    } else {
      setStatus("Transaction was mined but failed.", "error");
    }
  } catch (error) {
    console.error(error);
    hideModal("handoffModal");
    const rejected = error.code === "ACTION_REJECTED" || error.code === 4001 || error.info?.error?.code === 4001;
    setStatus(rejected ? "Transaction rejected in MetaMask." : (error.shortMessage || error.message || "Transaction signing failed."), rejected ? "warning" : "error");
  } finally {
    $("openMetaMaskButton").disabled = false;
    if (lastAnalysis) $("signButton").disabled = false;
  }
}

function displayTransactionHash(hash) {
  $("transactionHash").textContent = hash;
  const link = `${sepolia().explorer}/tx/${hash}`;
  $("transactionLink").href = link;
  $("confirmationHash").textContent = hash;
  $("confirmationLink").href = link;
}

function displayConfirmation(hash, blockNumber) {
  displayTransactionHash(hash);
  $("confirmationBlock").textContent = blockNumber ?? "—";
  $("confirmationTime").textContent = new Date().toLocaleString();
  $("confirmationScreen").classList.remove("is-hidden");
  $("confirmationScreen").scrollIntoView({ behavior: "smooth", block: "center" });
}

function loadDemo(kind) {
  const cases = {
    low: { to: "0x0000000000000000000000000000000000000001", amount: "0.001", gas: "21000", data: "0x", label: "Low-risk transfer" },
    high: { to: "0x000000000000000000000000000000000000dEaD", amount: "1.25", gas: "21000", data: "0x", label: "Large transfer with a suspicious recipient" },
    contract: { to: ethers.isAddress(CONTRACT_ADDRESS) ? CONTRACT_ADDRESS : "0x0000000000000000000000000000000000000001", amount: "0", gas: "70000", data: "0x095ea7b300000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001", label: "Approval / contract interaction" }
  };
  const demo = cases[kind];
  $("recipient").value = demo.to;
  $("amount").value = demo.amount;
  $("gas").value = demo.gas;
  $("data").value = demo.data;
  resetAnalysis();
  const contractNote = kind === "contract" && !ethers.isAddress(CONTRACT_ADDRESS) ? " Configure CONTRACT_ADDRESS before sending a real contract transaction." : "";
  setStatus(`${demo.label} demo loaded.${contractNote}`, kind === "high" ? "warning" : "info");
}

function newTransaction() {
  $("recipient").value = "";
  $("amount").value = "";
  $("gas").value = "";
  $("data").value = "";
  lastAnalysis = null;
  lastAnalyzedTransaction = null;
  $("signButton").disabled = true;
  $("confirmationScreen").classList.add("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  setStatus("Ready for a new protected transaction.", "info");
}

function setupInputProtection() {
  ["recipient", "amount", "data", "gas"].forEach((id) => $(id).addEventListener("input", () => {
    if (lastAnalysis) resetAnalysis("Transaction details changed. Analyze again before signing.");
  }));
}

function setupMetaMaskListeners() {
  if (!window.ethereum) return;
  window.ethereum.on("accountsChanged", async (accounts) => {
    walletAddress = accounts[0] || null;
    signer = null;
    if (walletAddress) { provider = new ethers.BrowserProvider(window.ethereum); signer = await provider.getSigner(); }
    updateWalletUI();
    resetAnalysis(walletAddress ? "Wallet account changed. Analyze the transaction again." : "Wallet disconnected.");
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}

function initializeApp() {
  $("connectWallet").addEventListener("click", connectWallet);
  $("analyzeButton").addEventListener("click", analyzeTransaction);
  $("signButton").addEventListener("click", openMetaMaskHandoff);
  $("openMetaMaskButton").addEventListener("click", signTransaction);
  $("lowRiskDemo").addEventListener("click", () => loadDemo("low"));
  $("highRiskDemo").addEventListener("click", () => loadDemo("high"));
  $("contractDemo").addEventListener("click", () => loadDemo("contract"));
  $("analysisClose").addEventListener("click", () => hideModal("analysisModal"));
  $("analysisDismiss").addEventListener("click", () => hideModal("analysisModal"));
  $("handoffClose").addEventListener("click", () => hideModal("handoffModal"));
  $("submittedClose").addEventListener("click", () => hideModal("submittedModal"));
  $("submittedDone").addEventListener("click", () => hideModal("submittedModal"));
  $("newTransactionButton").addEventListener("click", newTransaction);
  setupInputProtection();
  setupMetaMaskListeners();
  updateWalletUI();
  setStatus("Connect MetaMask to start a protected transaction.", "info");
}

document.addEventListener("DOMContentLoaded", initializeApp);