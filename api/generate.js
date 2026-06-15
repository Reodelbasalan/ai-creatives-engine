export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        messages: req.body.messages,
        system: req.body.system
      })
    });

    const text = await response.text();
    console.log('Anthropic response:', text.substring(0, 500));
    
    try {
      return res.status(200).json(JSON.parse(text));
    } catch(e) {
      return res.status(200).json({ 
        content: [{ text: 'API Error: ' + text.substring(0, 300) }] 
      });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
