import dbConnect from '../../../../lib/dbConnect';
import Tournament from '../../../../models/Tournament';
import { Wallet } from '@coinbase/coinbase-sdk';
import { ethers } from 'ethers';
import { initializeCDP } from '../../../../utils/cdpConfig';
import StoredData from '../../../../models/StoredData';

import axios from 'axios';
import { EAS, SchemaEncoder, NO_EXPIRATION } from "@ethereum-attestation-service/eas-sdk";

// EAS Contract Address and Schema
const EAS_CONTRACT_ADDRESS = "0x4200000000000000000000000000000000000021";
const SCHEMA_UID = "0xa675e7d3cb744939523f5bfb5a47eada9c89f74cf2cbc1fa5b39ef005373ca3e";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize the Coinbase SDK
    initializeCDP();

    await dbConnect();
    const { id } = req.query;

    // Fetch the tournament
    const tournament = await Tournament.findById(id);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Ensure the tournament is in DEBATE_ARENA mode
    if (tournament.mode !== 'DEBATE_ARENA') {
      return res.status(400).json({ error: 'Invalid tournament mode for resolution' });
    }

    // Calculate winners based on messages and scoring logic
    const winners = await calculateDebateWinners(tournament.messages);

    // Determine the category of the debate
    const category = await determineDebateCategory(tournament.messages.join(' '));

    // Store data on Walrus with proper await
    const walrusResponse = await storeDataOnWalrus(category, tournament.messages);
    console.log('Full Walrus Response:', walrusResponse); // Debug log
    
    if (walrusResponse && walrusResponse.alreadyCertified) {
      const blobId = walrusResponse.alreadyCertified.blobId;
      console.log('Extracted blobId:', blobId); // Debug log
      
      try {
        // Create the database entry first
        const storedData = await StoredData.create({ 
          category, 
          blobId
        });
        console.log('Data stored in database:', storedData); // Debug log

        // Create attestation directly
        try {
        //   const attestation = await createAttestation(
        //     category, 
        //     blobId, 
        //     agentWallet // Using the already imported wallet
        //   );
          
        //   console.log('Attestation created:', attestation);
          
          await StoredData.findByIdAndUpdate(
            storedData._id,
            { 
              attestationUID: attestation.attestationUID,
              attestedBy: attestation.attestedBy
            }
          );
        } catch (attestError) {
          console.error('Attestation failed but data is stored:', attestError);
        }
      } catch (dbError) {
        console.error('Database storage error:', dbError);
      }
    } else {
      console.error('Invalid Walrus response structure:', walrusResponse);
    }



    // Distribute prizes
    if (!tournament.prizesDistributed) {
      console.log('Distributing prizes for tournament:', tournament._id);

      let agentWallet;
      try {
        console.log('Wallet data:', tournament.walletData);
        agentWallet = await Wallet.import({
          walletId: tournament.walletData.walletId,
          seed: tournament.walletData.seed
        });

        // Store data if we have a valid Walrus response
        if (walrusResponse && walrusResponse.alreadyCertified) {
          const blobId = walrusResponse.alreadyCertified.blobId;
          console.log('Storing data with blobId:', blobId);
          
          try {
            // Store basic data first
            await StoredData.findOneAndUpdate(
              { blobId },
              { 
                category,
                blobId
              },
              { upsert: true }
            );
            console.log('Data stored successfully');

            /* Attestation code 
            try {
              // Create attestation
              const attestation = await createAttestation(
                category, 
                blobId, 
                agentWallet
              );
              
              console.log('Attestation created:', attestation);
              
              // Update stored data with attestation info
              await StoredData.findOneAndUpdate(
                { blobId },
                { 
                  attestationUID: attestation.attestationUID,
                  attestedBy: attestation.attestedBy
                },
                { upsert: true }
              );
            } catch (attestError) {
              console.error('Attestation failed:', attestError);
            }
            */
          } catch (dbError) {
            console.error('Database storage error:', dbError);
          }
        }

        // Continue with prize distribution
        const totalPrizePool = tournament.currentParticipants * tournament.entryFee;
        const prizePool = ethers.utils.parseEther(totalPrizePool.toString());
        const gasReserve = prizePool.mul(1).div(100); // 1% for gas
        const distributablePrize = prizePool.sub(gasReserve);

        // Quadratic distribution logic
        const totalQuadraticWeight = (5 * (5 + 1) * (2 * 5 + 1)) / 6; // Sum of squares for top 5
        for (let i = 0; i < winners.length; i++) {
          const rank = i + 1;
          const quadraticWeight = (6 - rank) ** 2; // Quadratic weight for rank
          const prizeAmount = distributablePrize.mul(quadraticWeight).div(totalQuadraticWeight);

          const transfer = await agentWallet.createTransfer({
            amount: ethers.utils.formatEther(prizeAmount),
            assetId: "eth",
            destination: winners[i],
            gasless: false
          });

          const result = await transfer.wait();
          console.log('Transfer completed:', result);

          // Update tournament with winner info
          tournament.winners.push({
            address: winners[i],
            rank: rank,
            prize: Number(ethers.utils.formatEther(prizeAmount))
          });
        }

        // Mark as completed
        tournament.prizesDistributed = true;
        tournament.status = 'COMPLETED';
        await tournament.save();
      } catch (importError) {
        console.error('Error importing wallet:', importError);
        return res.status(500).json({ error: 'Failed to import wallet' });
      }
    }

    // Return the winners along with the success message
    res.status(200).json({ message: 'Debate resolved and prizes distributed', winners: tournament.winners });
  } catch (error) {
    console.error('Error resolving debate:', error);
    res.status(500).json({ error: 'Failed to resolve debate' });
  }
}

// Example function to calculate winners based on messages
async function calculateDebateWinners(messages) {
  const scores = {};

  for (const message of messages) {
    if (message.role === 'user') {
      const score = await calculateDebateScore(message.content);
      if (!scores[message.senderAddress]) {
        scores[message.senderAddress] = 0;
      }
      scores[message.senderAddress] += score;
    }
  }

  // Sort participants by score and select top winners
  const sortedParticipants = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const winners = sortedParticipants.slice(0, 5).map(([address]) => address);

  return winners;
}

// Helper function to calculate debate score using GAIA API
async function calculateDebateScore(messageContent) {
  console.log('⚖️ Calculating Debate Score for:', messageContent.substring(0, 100) + '...');
  
  try {
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
            content: `INSTRUCTION: You are an AI debate judge scoring arguments.

              FORMAT: Evaluate the argument and return ONLY a number from 0 to 10.
              
              SCORING CRITERIA:
              10: Exceptional - Perfect logic, strong evidence, clear articulation
              7-9: Strong - Good reasoning, some evidence, clear points
              4-6: Average - Basic logic, limited evidence
              1-3: Weak - Poor reasoning, no evidence
              0: Invalid - Off-topic or incomprehensible
              
              EXAMPLE OUTPUTS:
              "8"
              "3"
              "5"`
          },
          {
            role: "user",
            content: messageContent
          }
        ],
        temperature: 0.3  // Low temperature for consistent scoring
      })
    });

    const data = await response.json();
    console.log('⚖️ Score Response:', data.choices?.[0]?.message?.content);
    
    const score = parseFloat(data.choices?.[0]?.message?.content);
    return isNaN(score) ? 0 : Math.min(Math.max(score, 0), 10); // Ensure score is between 0 and 10
  } catch (error) {
    console.error('⚖️ Error calculating debate score:', error);
    return 0;
  }
}

async function determineDebateCategory(messageContent) {
  console.log('🏷️ Determining Category for:', messageContent.substring(0, 100) + '...');
  
  try {
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
            content: `INSTRUCTION: You are an AI debate categorizer.

              FORMAT: Analyze the message and return EXACTLY ONE of these categories:
              - gaming
              - tech
              - science
              - values
              - morality
              - health
              
              REQUIREMENTS:
              - Return ONLY the category name, no other text
              - Choose the most relevant category
              - Be consistent in categorization
              
              EXAMPLE OUTPUTS:
              "tech"
              "science"
              "values"`
          },
          {
            role: "user",
            content: messageContent
          }
        ],
        temperature: 0.2  // Very low temperature for consistent categorization
      })
    });

    const data = await response.json();
    console.log('🏷️ Category Response:', data.choices?.[0]?.message?.content);
    
    const category = data.choices?.[0]?.message?.content?.trim().toLowerCase();
    const validCategories = ['gaming', 'tech', 'science', 'values', 'morality', 'health'];
    
    return validCategories.includes(category) ? category : 'unknown';
  } catch (error) {
    console.error('🏷️ Error determining debate category:', error);
    return 'unknown';
  }
}

async function storeDataOnWalrus(category, data) {
  const PUBLISHER = process.env.PUBLISHER_URL;

  try {
    const response = await fetch(`${PUBLISHER}/v1/store`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ category, data })
    });

    const result = await response.json();
    console.log('Store data on Walrus result:', result);
    return result; // Return the entire result object
  } catch (error) {
    console.error('Error storing data on Walrus:', error);
    return null;
  }
} 

async function createAttestation(category, blobId, agentWallet) {
  try {
    // Get the agent's address
    const agentAddress = await agentWallet.getAddress();

    // Create a provider and signer using the agent wallet
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const signer = new ethers.Wallet(agentWallet.privateKey, provider);

    // Initialize EAS with the agent wallet
    const eas = new EAS(EAS_CONTRACT_ADDRESS);
    eas.connect(signer);

    // Initialize SchemaEncoder with the schema string
    const schemaEncoder = new SchemaEncoder("string category, string blobId, address attestedBy");
    
    // Encode the data
    const encodedData = schemaEncoder.encodeData([
      { name: "category", value: category, type: "string" },
      { name: "blobId", value: blobId, type: "string" },
      { name: "attestedBy", value: agentAddress, type: "address" }
    ]);

    // Create the attestation using the agent wallet
    const transaction = await eas.attest({
      schema: SCHEMA_UID,
      data: {
        recipient: agentAddress,
        expirationTime: NO_EXPIRATION,
        revocable: true,
        data: encodedData,
      },
    });

    // Wait for the transaction to be mined
    const newAttestationUID = await transaction.wait();

    return {
      success: true,
      attestationUID: newAttestationUID,
      transactionHash: transaction.hash,
      attestedBy: agentAddress
    };
  } catch (error) {
    console.error('Error creating attestation:', error);
    throw error;
  }
} 