import { ethers } from 'ethers';
import { AIJudgeServiceManager } from '../contracts/types';
import { evaluateResponses } from '../utils/aiEvaluation';

export class AIJudgeOperator {
    private wallet: ethers.Wallet;
    private serviceManager: AIJudgeServiceManager;

    constructor(
        privateKey: string,
        serviceManagerAddress: string,
        provider: ethers.providers.Provider
    ) {
        this.wallet = new ethers.Wallet(privateKey, provider);
        this.serviceManager = AIJudgeServiceManager__factory.connect(
            serviceManagerAddress,
            this.wallet
        );
    }

    async registerAsOperator() {
        try {
            // Register with EigenLayer core
            const tx1 = await this.delegationManager.registerAsOperator({
                earningsReceiver: this.wallet.address,
                delegationApprover: ethers.constants.AddressZero,
                stakerOptOutWindowBlocks: 0
            }, "");
            await tx1.wait();
            console.log("✅ Registered with EigenLayer");

            // Register with AI Judge AVS
            const operatorSignature = await this.generateOperatorSignature();
            const tx2 = await this.serviceManager.registerOperatorWithSignature(
                operatorSignature,
                this.wallet.address
            );
            await tx2.wait();
            console.log("✅ Registered with AI Judge AVS");
        } catch (error) {
            console.error("Registration failed:", error);
            throw error;
        }
    }

    async monitorJudgmentTasks() {
        console.log("🔍 Monitoring for new judgment tasks...");
        
        this.serviceManager.on(
            "NewJudgmentTaskCreated",
            async (taskId, debateId, prompt, responses) => {
                console.log(`📝 New judgment task ${taskId} received`);
                await this.handleJudgmentTask(taskId, debateId, prompt, responses);
            }
        );
    }

    private async handleJudgmentTask(
        taskId: number,
        debateId: string,
        prompt: string,
        responses: string[]
    ) {
        try {
            // AI evaluation of responses
            const scores = await evaluateResponses(prompt, responses);
            
            // Create signature
            const messageHash = ethers.utils.solidityKeccak256(
                ["bytes32", "string", "string[]"],
                [debateId, prompt, scores]
            );
            const signature = await this.wallet.signMessage(
                ethers.utils.arrayify(messageHash)
            );

            // Submit judgment
            const tx = await this.serviceManager.submitJudgment(
                taskId,
                scores,
                signature
            );
            await tx.wait();
            
            console.log(`✅ Judgment submitted for task ${taskId}`);
        } catch (error) {
            console.error(`Failed to handle task ${taskId}:`, error);
        }
    }
} 