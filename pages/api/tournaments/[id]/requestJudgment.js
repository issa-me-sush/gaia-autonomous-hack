import { ethers } from 'ethers';
import { AIJudgeServiceManager__factory } from '../../../../contracts/types';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { id } = req.query;
        const tournament = await Tournament.findById(id);

        const provider = new ethers.providers.JsonRpcProvider(
            process.env.EIGENLAYER_RPC_URL
        );
        
        const serviceManager = AIJudgeServiceManager__factory.connect(
            process.env.AI_JUDGE_SERVICE_MANAGER,
            new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY, provider)
        );

        // Create judgment task
        const tx = await serviceManager.createJudgmentTask(
            ethers.utils.id(id), // debate ID
            tournament.prompt,    // debate prompt
            tournament.messages.filter(m => m.type === 'response')
                               .map(m => m.content)
        );
        await tx.wait();

        res.status(200).json({
            success: true,
            message: 'Judgment task created'
        });

    } catch (error) {
        console.error('Failed to create judgment task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
} 