export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024', quality = 'hd' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.DALLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not set in Vercel env vars' });
    }

    // Only use dall-e-3 — most reliable
    const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
    const safeSize = validSizes.includes(size) ? size : '1024x1024';

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        size: safeSize,
        quality: 'hd',
        n: 1
      })
    });

    const responseText = await response.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({ error: 'OpenAI returned invalid response: ' + responseText.substring(0, 100) });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'DALL-E API error'
      });
    }

    return res.status(200).json({
      success: true,
      url: data.data[0]?.url || null
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
