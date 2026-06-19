export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, apiKey, type, model, duration } = req.body;
  if (!prompt || !apiKey) return res.status(400).json({ error: 'Missing prompt or API key' });

  try {
    // Higgsfield Cloud API
    const endpoint = type === 'image' 
      ? 'https://cloud.higgsfield.ai/api/v1/generate/image'
      : 'https://cloud.higgsfield.ai/api/v1/generate/video';

    const body = type === 'image' ? {
      prompt: prompt,
      aspect_ratio: '9:16',
      model: model || 'soul-2'
    } : {
      prompt: prompt,
      duration: duration || 4,
      aspect_ratio: '9:16',
      model: model || 'soul-2'
    };

    const submitRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(body)
    });

    const submitData = await submitRes.json();

    if (!submitRes.ok) {
      return res.status(400).json({ 
        error: submitData.error || submitData.message || 'Higgsfield API error',
        details: submitData
      });
    }

    // If direct URL returned
    if (submitData.url || submitData.image_url || submitData.video_url) {
      return res.status(200).json({ 
        url: submitData.url || submitData.image_url || submitData.video_url,
        status: 'completed'
      });
    }

    // If job ID returned — poll for result
    const jobId = submitData.job_id || submitData.id || submitData.request_id;
    if (!jobId) {
      return res.status(200).json({ 
        status: 'processing',
        message: 'Job submitted — check Higgsfield dashboard',
        raw: submitData
      });
    }

    // Poll up to 60 seconds
    const pollUrl = 'https://cloud.higgsfield.ai/api/v1/jobs/' + jobId;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes = await fetch(pollUrl, {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });
      const pollData = await pollRes.json();
      if (pollData.status === 'completed' || pollData.status === 'COMPLETED') {
        const url = pollData.url || pollData.output?.url || pollData.result?.url;
        if (url) return res.status(200).json({ url, status: 'completed' });
      }
      if (pollData.status === 'failed' || pollData.status === 'FAILED') {
        return res.status(400).json({ error: 'Generation failed', details: pollData });
      }
    }

    return res.status(200).json({ 
      status: 'processing',
      message: 'Still generating — check Higgsfield dashboard',
      job_id: jobId
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
