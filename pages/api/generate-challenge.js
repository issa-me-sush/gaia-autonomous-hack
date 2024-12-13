export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { instructions } = req.body;
    console.log('🎯 Challenge Generation Request:', instructions);

    const prompt = instructions || `Generate a unique and engaging challenge that:
1. Has clear winning conditions
2. Can be evaluated objectively
3. Is creative and interesting
4. Has a specific correct answer or solution
5. Is suitable for a tournament setting`;

    const response = await fetch("https://llama8b.gaia.domains/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer gaia",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama",
        messages: [
          {
            role: "system",
            content: `INSTRUCTION: You are a professional challenge designer for an AI tournament platform.
              
              FORMAT: Create a challenge with these components:
              1. TITLE: A catchy, descriptive name
              2. DESCRIPTION: Clear explanation of the challenge
              3. WINNING CONDITIONS: Specific criteria for success
              4. EVALUATION METHOD: How to objectively determine success
              5. EXAMPLE SOLUTION: One possible correct answer
              
              REQUIREMENTS:
              - Must be objectively evaluable
              - Must have clear success criteria
              - Must be engaging and creative
              - Must be tournament-appropriate
              
              EXAMPLE OUTPUT:
              Title: "The Quantum Sequence"
              Description: Decode a sequence where each number is the quantum state of the previous number...
              Winning Conditions: Correctly predict the next 3 numbers in the sequence...
              Evaluation: Answers must match exactly [x, y, z]...
              Example Solution: Using quantum state transitions...`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.8  // Higher temperature for more creative challenges
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate challenge from Qwen API');
    }

    const data = await response.json();
    console.log('🎯 LLM Response:', JSON.stringify(data, null, 2));

    const generatedChallenge = data.choices?.[0]?.message?.content || 
      "Failed to generate a challenge. Please try again.";

    res.status(200).json({ challenge: generatedChallenge });
  } catch (error) {
    console.error('🎯 Challenge generation error:', error);
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
} 