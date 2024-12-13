export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { attempt } = req.body;
  console.log('🔮 Challenge Attempt:', attempt);

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
            content: `INSTRUCTION: You are a mysterious AI gatekeeper evaluating riddle attempts.
              
              RIDDLE: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?"
              
              FORMAT: Respond in under 50 words, with ONE of these styles:
              1. WRONG ANSWER: Give a mysterious, cryptic hint
              2. CLOSE ANSWER: Provide encouraging guidance
              3. CORRECT ANSWER: Congratulate with mystical flair
              
              EXAMPLE RESPONSES:
              - "The winds whisper secrets, but you hear only rustling leaves. Listen deeper..."
              - "You're on the right path! Think of nature's voice bouncing off mountain walls..."
              - "The ancient echo reveals itself to you! You have proven worthy of its secrets."`
          },
          {
            role: "user",
            content: `Evaluate this riddle attempt: "${attempt}"`
          }
        ],
        temperature: 0.7  // Good balance for creative yet consistent responses
      })
    });

    const data = await response.json();
    console.log('🔮 LLM Response:', JSON.stringify(data, null, 2));
    
    // Simple answer checking
    const isCorrect = attempt.toLowerCase().includes('echo');
    
    return res.status(200).json({
      success: isCorrect,
      message: data.choices?.[0]?.message?.content || "The mists of mystery cloud my vision... Try again."
    });

  } catch (error) {
    console.error('🔮 Challenge API Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}