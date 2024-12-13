import dbConnect from '../../../../lib/dbConnect';
import Tournament from '../../../../models/Tournament';
import { distributePrizes } from '../../../../utils/prizeDistribution';
import { submitToFlock } from '../../../../utils/flockIntegration';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const { id } = req.query;

    const tournament = await Tournament.findById(id);
    if (!tournament || tournament.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Invalid tournament or already completed' });
    }

    // Original tournament completion logic
    tournament.status = 'COMPLETED';
    tournament.completedAt = new Date();

    // Submit tournament data to FLock for training
    try {
      const flockResult = await submitToFlock(tournament);
      tournament.flockSubmissionId = flockResult.submissionId;
      console.log('Successfully submitted to FLock:', flockResult);
    } catch (flockError) {
      console.error('FLock submission error:', flockError);
      // Continue with completion even if FLock submission fails
    }

    await tournament.save();
    res.status(200).json({ success: true, tournament });

  } catch (error) {
    console.error('Tournament completion error:', error);
    res.status(500).json({ error: 'Failed to complete tournament' });
  }
}

function determineDebateWinners(tournament) {
  return tournament.participants
    .sort((a, b) => b.score - a.score)
    .filter(p => p.score > 0)
    .map(p => p.address);
}

function determineTwentyQuestionsWinners(tournament) {
  return tournament.participants
    .sort((a, b) => a.guessCount - b.guessCount)
    .filter(p => p.hasGuessedCorrect)
    .map(p => p.address);
} 