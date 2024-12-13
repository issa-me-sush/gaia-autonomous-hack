import dbConnect from '../../../../lib/dbConnect';
import Tournament from '../../../../models/Tournament';
import { Wallet } from '@coinbase/coinbase-sdk';
import { ethers } from 'ethers';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const { id } = req.query;
    const { message, userAddress } = req.body;

    const tournament = await Tournament.findById(id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Verify participant
    const participant = tournament.participants?.find(
      p => p.address.toLowerCase() === userAddress.toLowerCase()
    );
    if (!participant || participant.attemptsLeft <= 0) {
      return res.status(403).json({ error: 'No attempts remaining' });
    }

    let aiResponse;
    let isSuccess = false;
    let shouldDistributePrizes = false;

    switch (tournament.mode) {
      case 'TWENTY_QUESTIONS':
        aiResponse = await handleTwentyQuestions(message, tournament.secretTerm);
        isSuccess = aiResponse.includes("Congratulations! You've correctly guessed");
        if (isSuccess) {
          participant.hasGuessedCorrect = true;
          participant.guessCount = (participant.guessCount || 0) + 1;
          shouldDistributePrizes = true;
        }
        break;

      case 'DEBATE_ARENA':
        aiResponse = await handleDebateResponse(message, tournament.debateTopic);
        // Add debate-specific win condition
        break;

      case 'AGENT_CHALLENGE':
        aiResponse = await handleAgentChallenge(message, tournament.challengeStatement);
        isSuccess = aiResponse.includes("Challenge completed successfully");
        if (isSuccess) {
          participant.hasCompleted = true;
          shouldDistributePrizes = true;
        }
        break;
    }

    // Add messages to tournament
    tournament.messages = tournament.messages || [];
    tournament.messages.push({
      role: 'user',
      content: message,
      senderAddress: userAddress.toLowerCase(),
      recipientAddress: tournament.treasuryAddress,
      timestamp: new Date()
    });
    tournament.messages.push({
      role: 'assistant',
      content: aiResponse,
      senderAddress: tournament.treasuryAddress,
      recipientAddress: userAddress.toLowerCase(),
      timestamp: new Date()
    });

    try {
      await tournament.save();
      console.log('Message stored successfully');
    } catch (saveError) {
      console.error('Error saving tournament:', saveError);
      return res.status(500).json({ error: 'Failed to store message' });
    }

    // Update participant attempts if needed
    if (isSuccess || tournament.mode === 'TWENTY_QUESTIONS') {
      participant.attemptsLeft -= 1;
    }

    // If we have a winner, distribute prizes
    if (shouldDistributePrizes && !tournament.prizesDistributed) {
      try {
        console.log('Distributing prizes for tournament:', tournament._id);
        const winners = [participant.address]; // For now, just the current winner
        
        // Calculate total prize pool from current participants
        const totalPrizePool = tournament.currentParticipants * tournament.entryFee;
        const prizePool = ethers.utils.parseEther(totalPrizePool.toString());
        const gasReserve = prizePool.mul(1).div(100); // 1% for gas
        const distributablePrize = prizePool.sub(gasReserve);
        
        let prizeAmount = distributablePrize;
        let rank = 1;

        // Determine rank and prize amount based on mode
        switch (tournament.mode) {
          case 'DEBATE_ARENA':
            rank = tournament.winners?.length + 1 || 1;
            if (rank <= 5) { // Top 5 get prizes
              const percentages = [35, 25, 20, 12, 8];
              prizeAmount = distributablePrize.mul(percentages[rank - 1]).div(100);
            }
            break;
          
          case 'TWENTY_QUESTIONS':
            rank = tournament.winners?.length + 1 || 1;
            if (rank <= 3) { // Top 3 get prizes
              const percentages = [50, 30, 20];
              prizeAmount = distributablePrize.mul(percentages[rank - 1]).div(100);
            }
            break;
          
          case 'AGENT_CHALLENGE':
            // Winner takes all
            rank = 1;
            break;
        }

        const agentWallet = await Wallet.import(tournament.walletData);
        const transfer = await agentWallet.createTransfer({
          amount: ethers.utils.formatEther(prizeAmount),
          assetId: "eth",
          destination: winners[0],
          gasless: false
        });

        const result = await transfer.wait();
        console.log('Transfer completed:', result);

        // Update tournament with winner info
        tournament.winners.push({
          address: winners[0],
          rank: rank,
          prize: Number(ethers.utils.formatEther(prizeAmount))
        });
        
        // Only mark as completed if this was the last winner
        if ((tournament.mode === 'DEBATE_ARENA' && rank === 5) ||
            (tournament.mode === 'TWENTY_QUESTIONS' && rank === 3) ||
            (tournament.mode === 'AGENT_CHALLENGE')) {
          tournament.prizesDistributed = true;
          tournament.status = 'COMPLETED';
        }
        
        await tournament.save();
        
        // Send response with prize info
        return res.status(200).json({
          message: aiResponse,
          success: isSuccess,
          attemptsLeft: participant.attemptsLeft,
          prizeDistributed: {
            amount: ethers.utils.formatEther(prizeAmount),
            txHash: result.transaction?.transaction_hash || result.transaction_hash
          }
        });

      } catch (error) {
        console.error('Prize distribution error:', error);
      }
    }

    // Always send a response even if prize distribution fails
    return res.status(200).json({
      message: aiResponse,
      success: isSuccess,
      attemptsLeft: participant.attemptsLeft
    });

  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
}

// Helper function to calculate debate score based on AI response
function calculateDebateScore(message, aiResponse) {
  // Implement scoring logic based on AI response
  // For example, look for keywords like "excellent point", "strong argument", etc.
  let score = 0;
  if (aiResponse.includes('excellent point')) score += 3;
  if (aiResponse.includes('strong argument')) score += 2;
  if (aiResponse.includes('valid point')) score += 1;
  return score;
}

// Helper functions for different modes
async function handleTwentyQuestions(question, secretTerm) {
  console.log('🎮 Twenty Questions Request:', { question, secretTerm });
  
  const response = await fetch("https://qwen72b.gaia.domains/v1/chat/completions", {
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
          content: `INSTRUCTION: You are playing a 20 questions game where you must answer questions about the secret term "${secretTerm}". 

            FORMAT: You must respond with EXACTLY ONE of these phrases:
            * "Yes" - for true statements about the term
            * "No" - for false statements about the term
            * "I cannot answer that" - for invalid questions
            * "Congratulations! You've correctly guessed the term!" - only when they guess "${secretTerm}"

            EXAMPLE INTERACTION:
            Human: Is it alive?
            Assistant: Yes
            Human: Is it ${secretTerm}?
            Assistant: Congratulations! You've correctly guessed the term!
            Human: What color is it?
            Assistant: I cannot answer that`
        },
        {
          role: "user",
          content: `Question about the secret term "${secretTerm}": ${question}`
        }
      ],
      temperature: 0.1  // Add lower temperature for more consistent responses
    })
  });

  const data = await response.json();
  console.log('🎮 LLM Response:', JSON.stringify(data, null, 2));
  
  if (data.choices && data.choices[0]?.message?.content) {
    const content = data.choices[0].message.content.trim();
    // Only return if it's one of our valid responses
    const validResponses = ["Yes", "No", "I cannot answer that", "Congratulations! You've correctly guessed the term!"];
    if (validResponses.includes(content)) {
      return content;
    }
  }
  
  return "I cannot answer that";
}

async function handleDebateResponse(message, topic) {
  console.log('🎭 Debate Response Request:', { message, topic });

  const response = await fetch("https://qwen72b.gaia.domains/v1/chat/completions", {
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
          content: `INSTRUCTION: You are an AI judge evaluating arguments in a debate about "${topic}".
            The participants are debating whether ${topic} is beneficial or harmful.
            
            FORMAT: Your response must include:
            1. A clear evaluation of the argument's strength (1-2 sentences)
            2. Specific feedback on logic and evidence (2-3 sentences)
            3. A constructive suggestion for improvement (1 sentence)
            
            EXAMPLE RESPONSE:
            "Your argument about economic impact is well-structured with clear examples. However, the statistics cited need more recent sources to strengthen your case. Consider including data from the past 2-3 years to make your point more compelling."`
        },
        {
          role: "user",
          content: `Evaluate this argument about ${topic}: ${message}`
        }
      ],
      temperature: 0.7  // Higher temperature for more creative feedback
    })
  });

  const data = await response.json();
  console.log('🎭 LLM Response:', JSON.stringify(data, null, 2));
  
  return data.choices?.[0]?.message?.content || "I cannot evaluate this argument at this time.";
}

async function handleAgentChallenge(message, challenge) {
  console.log('🤖 Agent Challenge Request:', { message, challenge });

  const response = await fetch("https://qwen72b.gaia.domains/v1/chat/completions", {
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
          content: `INSTRUCTION: You are evaluating solutions for this challenge: "${challenge}"

            FORMAT: Your response must:
            1. Start with a clear evaluation of the solution
            2. Provide specific feedback on what works or needs improvement
            3. End with EXACTLY ONE of these conclusions:
               * "Challenge completed successfully" - if the solution is correct
               * "Challenge not yet completed" - if the solution needs more work

            EXAMPLE RESPONSE:
            "Your solution demonstrates good understanding of the core concept. The implementation is efficient but lacks error handling. Consider adding try-catch blocks for robustness. Challenge not yet completed"`
        },
        {
          role: "user",
          content: `Evaluate this solution for the challenge "${challenge}": ${message}`
        }
      ],
      temperature: 0.5  // Balanced temperature for evaluation
    })
  });

  const data = await response.json();
  console.log('🤖 Agent Response:', JSON.stringify(data, null, 2));
  
  return data.choices?.[0]?.message?.content || "I cannot evaluate this solution at this time.";
}