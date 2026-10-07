// NexChain frontend configuration. Replace these values for your deployment.

const ACTIVE_NETWORK = "sepolia";

// Your deployed RecordRegistry (or demo contract) address on Ethereum Sepolia.
const CONTRACT_ADDRESS = "0xBDCE5b0306C3c1ADb3477A0fd2729Cd6D9bdD352";

// URL of the existing Flask/Node backend that exposes POST /analyze-transaction.
const BACKEND_URL = "https://nex-chain-mu.vercel.app";

// Kept for compatibility with the existing on-chain analysis registry.
const CONTRACT_ABI = [
  "function recordAnalysis(bytes32 analysisHash, string txType, string risk)",
  "function analyses(bytes32) view returns (string txType, string risk, uint256 timestamp)",
  "event AnalysisRecorded(bytes32 indexed analysisHash, string txType, string risk, uint256 timestamp)"
];

const NETWORKS = {
  sepolia: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainIdHex: "0xAA36A7",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    currency: "ETH"
  }
};