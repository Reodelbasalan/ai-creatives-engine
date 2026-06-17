export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, apiKey, model, duration, type } = req.body;

  if (!prompt || !apiKey) {
    return res.status(400).json({ error: 'Missing prompt or API key' });
  }

  try {
    // Step 1: Submit generation request
    const submitRes = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model || 'grok-imagine-video-1.5-preview',
        prompt: prompt,
        n: 1,
        response_format: 'url'
      })
    });

    const submitData = await submitRes.json();

    if (!submitRes.ok) {
      return res.status(400).json({ 
        error: submitData.error?.message || 'Grok API error',
        details: submitData
      });
    }

    // Check if we have a direct URL or need to poll
    if (submitData.data && submitData.data[0]?.url) {
      return res.status(200).json({ 
        url: submitData.data[0].url,
        status: 'completed'
      });
    }

    // If generation_id returned, poll for result
    const genId = submitData.generation_id || submitData.id;
    if (!genId) {
      return res.status(200).json({ 
        status: 'processing',
        message: 'Generation submitted. Check Grok dashboard.',
        raw: submitData
      });
    }

    // Poll for result (max 60 seconds)
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const pollRes = await fetch('https://api.x.ai/v1/images/' + genId, {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });
      
      const pollData = await pollRes.json();
      
      if (pollData.status === 'completed' && pollData.url) {
        return res.status(200).json({ url: pollData.url, status: 'completed' });
      }
      if (pollData.status === 'failed') {
        return res.status(400).json({ error: 'Generation failed', details: pollData });
      }
    }

    return res.status(200).json({ 
      status: 'processing',
      message: 'Still generating — check Grok dashboard in a few seconds.',
      generation_id: genId
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
