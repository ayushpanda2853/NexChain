// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AI Wallet Guard Audit Registry
/// @notice Stores only a fingerprint and minimal metadata for transaction analyses.
contract RecordRegistry {
    struct Analysis {
        string txType;
        string risk;
        uint256 timestamp;
    }

    mapping(bytes32 => Analysis) public analyses;

    /// Emitted whenever an analysis fingerprint is recorded on-chain.
    event AnalysisRecorded(
        bytes32 indexed analysisHash,
        string txType,
        string risk,
        uint256 timestamp
    );

    /// Record a tamper-evident analysis fingerprint and non-sensitive metadata.
    function recordAnalysis(
        bytes32 analysisHash,
        string calldata txType,
        string calldata risk
    ) external {
        require(analysisHash != bytes32(0), "Invalid analysis hash");
        require(bytes(txType).length > 0, "Transaction type required");
        require(bytes(risk).length > 0, "Risk level required");
        require(analyses[analysisHash].timestamp == 0, "Analysis already recorded");

        analyses[analysisHash] = Analysis(txType, risk, block.timestamp);
        emit AnalysisRecorded(analysisHash, txType, risk, block.timestamp);
    }
}