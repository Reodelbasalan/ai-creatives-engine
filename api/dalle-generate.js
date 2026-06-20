export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, apiKey, size, quality, style } = req.body;
  if (!prompt || !apiKey) return res.status(400).json({ error: 'Missing prompt or API key' });

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: size || '1024x1792', // 9:16 portrait for mobile video
        quality: quality || 'hd',
        style: style || 'vivid'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({ 
        error: data.error?.message || 'DALL-E API error',
        details: data
      });
    }

    const imageUrl = data.data?.[0]?.url;
    const revisedPrompt = data.data?.[0]?.revised_prompt;

    if (!imageUrl) {
      return res.status(400).json({ error: 'No image URL returned' });
    }

    return res.status(200).json({ 
      url: imageUrl,
      revised_prompt: revisedPrompt,
      status: 'completed'
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
