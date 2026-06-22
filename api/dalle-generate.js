export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024', quality = 'hd', style = 'vivid', n = 1, apiKey: bodyApiKey } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    // Use key from request body first, then env vars
    const apiKey = bodyApiKey || process.env.DALLE_API_KEY || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'DALL-E API key not configured' });
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        size,
        quality,
        style,
        n: 1
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || 'DALL-E API error' 
      });
    }

    return res.status(200).json({
      success: true,
      images: data.data,
      url: data.data[0]?.url
    });
  } catch (error) {
    console.error('DALL-E generate error:', error);
    return res.status(500).json({ error: error.message });
  }
}
