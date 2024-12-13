import { Wallet } from "@coinbase/coinbase-sdk";
import dbConnect from '../../../lib/dbConnect';
import Tournament from '../../../models/Tournament';
import { TOURNAMENT_MODES } from '../../../config/tournamentModes';
import { initializeCDP } from "@/utils/cdpConfig";
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();
    initializeCDP();

    const {
      name,
      mode,
      isAutoGenerated,
      entryFee,
      maxParticipants,
      agentInstructions,
      creatorAddress,
      duration,
      debateTopic,
      secretTerm,
      challengeStatement
    } = req.body;

    // Mode-specific validation
    if (mode === 'DEBATE_ARENA' && !debateTopic) {
      return res.status(400).json({ error: 'Debate topic is required' });
    }

    if (mode === 'TWENTY_QUESTIONS' && !secretTerm) {
      return res.status(400).json({ error: 'Secret term is required' });
    }

    // Create agent wallet for all tournament types
    const agentWallet = await Wallet.create({ 
      networkId: 'base-sepolia',
      config: {
        environment: 'development'
      }
    });

    const treasuryAddressObj = await agentWallet.getDefaultAddress();
    const treasuryAddress = treasuryAddressObj.addressId || treasuryAddressObj.toString().match(/0x[a-fA-F0-9]{40}/)[0];
    const walletData = {
      walletId: agentWallet.export().walletId,
      seed: agentWallet.export().seed
    };

    // Get default instructions if none provided
    const defaultInstructions = mode === 'AGENT_CHALLENGE'
      ? TOURNAMENT_MODES[mode].defaultInstructions[isAutoGenerated ? 'auto' : 'custom']
      : TOURNAMENT_MODES[mode].defaultInstructions;

    // Generate or format challenge statement based on mode
    let finalChallengeStatement = challengeStatement;

    if (mode === 'AGENT_CHALLENGE' && isAutoGenerated) {
      // Generate challenge statement using red-pill AI
      const completion = await fetch("https://qwen72b.gaia.domains/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer gaia",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "qwen72b",
          messages: [
            {
              role: "system",
              content: `INSTRUCTION: You are a tournament challenge creator crafting public challenge statements.

                FORMAT: Create a challenge statement that is:
                1. CONCISE: Under 100 words
                2. INTRIGUING: Captures interest
                3. GOAL-FOCUSED: Emphasize what to achieve, not how
                4. CLEAR: No ambiguity in objectives
                
                REQUIREMENTS:
                - Must be engaging and mysterious
                - Must not reveal implementation details
                - Must clearly state success criteria
                - Must be tournament-appropriate
                
                EXAMPLE OUTPUT:
                "Decode the Ancient Cipher: A mysterious sequence of symbols has been discovered in digital ruins. 
                Your task: Decipher the pattern and predict the next three symbols in the sequence. 
                Success awaits those who can unlock its secrets with precision and insight."`
            },
            {
              role: "user",
              content: agentInstructions || defaultInstructions
            }
          ],
          temperature: 0.6  // Balanced for creativity while maintaining clarity
        })
      });

      const data = await completion.json();
      finalChallengeStatement = data.choices[0].message.content;
      console.log('Generated challenge statement:', finalChallengeStatement);
    } else if (mode === 'DEBATE_ARENA') {
      finalChallengeStatement = `Debate Topic: ${debateTopic}\n\nParticipate in this structured debate. Present your arguments clearly and respond to others' points. An AI judge will evaluate responses based on logic, evidence, and argumentation quality.`;
    } else if (mode === 'TWENTY_QUESTIONS') {
      finalChallengeStatement = `Try to guess the secret term by asking yes/no questions. You have ${ 20} questions to figure it out!`;
    }

    const tournament = new Tournament({
      name,
      mode,
      isAutoGenerated: mode === 'AGENT_CHALLENGE' ? isAutoGenerated : undefined,
      entryFee,
      maxParticipants,
      agentInstructions: agentInstructions || defaultInstructions,
      creatorAddress,
      duration: mode === 'DEBATE_ARENA' ? duration : undefined,
      debateTopic,
      secretTerm,
      challengeStatement: finalChallengeStatement,
      status: 'PENDING',
      winningCondition: TOURNAMENT_MODES[mode].winningCondition,
      prizeDistribution: TOURNAMENT_MODES[mode].prizeDistribution,
      treasuryAddress,
      walletData
    });

    await tournament.save();
    res.status(201).json(tournament);

  } catch (error) {
    console.error('Tournament creation error:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ 
      error: 'Failed to create tournament',
      details: error.message 
    });
  }
} 