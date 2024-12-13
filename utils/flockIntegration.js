import { ethers } from 'ethers';

// FLock integration constants
const FLOCK_TASK_ADDRESS = process.env.FLOCK_TASK_ADDRESS;
const FLOCK_API_KEY = process.env.FLOCK_API_KEY;

// Data categories matching your tournament types
const DATA_CATEGORIES = {
  DEBATE_ARENA: 'debate_data',
  TWENTY_QUESTIONS: 'qa_data',
  AGENT_CHALLENGE: 'challenge_data'
};

export const prepareTrainingData = (messages, category) => {
  // Format messages for FLock training
  return messages.map(msg => ({
    content: msg.content,
    role: msg.role,
    metadata: {
      timestamp: msg.timestamp,
      category: category,
      quality_score: msg.score || 0,
      interaction_type: msg.role === 'user' ? 'input' : 'response'
    }
  }));
};

export const submitToFlock = async (tournamentData) => {
  try {
    const {
      mode,
      messages,
      winners,
      challengeStatement,
      debateTopic
    } = tournamentData;

    // Prepare context-specific metadata
    const contextData = {
      tournament_type: mode,
      topic: debateTopic || challengeStatement,
      winner_count: winners?.length || 0,
      total_participants: tournamentData.currentParticipants,
      completion_rate: winners?.length / tournamentData.currentParticipants
    };

    // Format data for FLock training
    const trainingData = prepareTrainingData(messages, DATA_CATEGORIES[mode]);

    // Submit to FLock's FL Alliance
    const response = await fetch('https://api.flock.io/fl-alliance/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FLOCK_API_KEY}`
      },
      body: JSON.stringify({
        task_address: FLOCK_TASK_ADDRESS,
        training_data: trainingData,
        metadata: contextData,
        model_type: mode === 'DEBATE_ARENA' ? 'debate_evaluator' : 
                   mode === 'TWENTY_QUESTIONS' ? 'qa_model' : 'challenge_validator'
      })
    });

    const result = await response.json();
    console.log('FLock submission result:', result);
    return result;

  } catch (error) {
    console.error('Error submitting to FLock:', error);
    throw error;
  }
};

export const initializeFlockClient = async () => {
  try {
    // Initialize FLock client for federated learning
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // Setup FLock client configuration
    const flockConfig = {
      taskAddress: FLOCK_TASK_ADDRESS,
      wallet: wallet,
      dataPath: './data/tournament_data',
      modelType: 'multi_purpose_evaluator'
    };

    return flockConfig;
  } catch (error) {
    console.error('Error initializing FLock client:', error);
    throw error;
  }
}; 