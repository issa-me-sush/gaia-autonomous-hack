// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import "@eigenlayer/contracts/interfaces/IServiceManager.sol";
import "@eigenlayer/contracts/permissions/ECDSAServiceManagerBase.sol";

/// @title AI Judge Service Manager
/// @notice Manages AI agent validation tasks for tournament judgments
contract AIJudgeServiceManager is ECDSAServiceManagerBase {
    using ECDSAUpgradeable for bytes32;

    struct JudgmentTask {
        bytes32 debateId;      // Unique identifier for the debate
        string prompt;         // Challenge or debate prompt
        string[] responses;    // Participant responses
        uint32 taskCreatedBlock;
        bool isCompleted;
    }

    // Storage
    mapping(uint256 => bytes32) public allTaskHashes;
    mapping(address => mapping(uint256 => bytes)) public allTaskResponses;
    mapping(uint256 => JudgmentTask) public tasks;
    uint256 public latestTaskNum;

    // Events
    event NewJudgmentTaskCreated(
        uint256 indexed taskId,
        bytes32 indexed debateId,
        string prompt
    );
    
    event JudgmentTaskCompleted(
        uint256 indexed taskId,
        bytes32 indexed debateId,
        address indexed judge,
        string[] scores
    );

    /// @notice Creates a new judgment task for AI agents
    function createJudgmentTask(
        bytes32 debateId,
        string memory prompt,
        string[] memory responses
    ) external returns (JudgmentTask memory) {
        JudgmentTask memory newTask = JudgmentTask({
            debateId: debateId,
            prompt: prompt,
            responses: responses,
            taskCreatedBlock: uint32(block.number),
            isCompleted: false
        });

        // Store task hash and emit event
        allTaskHashes[latestTaskNum] = keccak256(abi.encode(newTask));
        tasks[latestTaskNum] = newTask;
        
        emit NewJudgmentTaskCreated(latestTaskNum, debateId, prompt);
        latestTaskNum++;

        return newTask;
    }

    /// @notice AI agents submit their judgments
    function submitJudgment(
        uint256 taskId,
        string[] memory scores,
        bytes memory signature
    ) external {
        JudgmentTask memory task = tasks[taskId];
        require(!task.isCompleted, "Task already completed");
        require(
            scores.length == task.responses.length,
            "Invalid scores length"
        );

        // Verify operator signature
        bytes32 messageHash = keccak256(abi.encode(
            task.debateId,
            task.prompt,
            scores
        ));
        
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        bytes4 magicValue = IERC1271Upgradeable.isValidSignature.selector;
        
        require(
            magicValue == ECDSAStakeRegistry(stakeRegistry).isValidSignature(
                ethSignedMessageHash,
                signature
            ),
            "Invalid signature"
        );

        // Store response and mark complete
        allTaskResponses[msg.sender][taskId] = signature;
        tasks[taskId].isCompleted = true;

        emit JudgmentTaskCompleted(taskId, task.debateId, msg.sender, scores);
    }
} 