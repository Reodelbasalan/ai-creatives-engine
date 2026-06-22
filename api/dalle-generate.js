export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024', quality = 'standard', apiKey: bodyApiKey } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const apiKey = bodyApiKey || process.env.DALLE_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'DALL-E API key not configured' });
    }

    // Try gpt-image-1 first, fallback to dall-e-3
    let response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size,
        quality,
        n: 1
      })
    });

    let data = await response.json();

    // Fallback to dall-e-3 if gpt-image-1 fails
    if (!response.ok) {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          size: '1024x1024', // dall-e-3 safe size
          quality: 'hd',
          n: 1
        })
      });
      data = await response.json();
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'DALL-E API error'
      });
    }

    // gpt-image-1 returns base64, dall-e-3 returns URL
    const imageData = data.data[0];
    const result = {
      success: true,
      url: imageData?.url || null,
      b64_json: imageData?.b64_json || null
    };

    // If base64, convert to data URL so frontend can display it
    if (!result.url && result.b64_json) {
      result.url = `data:image/png;base64,${result.b64_json}`;
    }

    return res.status(200).json(result);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
