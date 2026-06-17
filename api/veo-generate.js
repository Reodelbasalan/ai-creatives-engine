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

  const veoModel = model || 'veo-003';

  try {
    // Google AI Studio / Gemini API for Veo
    const submitRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + veoModel + ':generateVideo?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: { text: prompt },
          videoGenerationConfig: {
            durationSeconds: duration || 8,
            aspectRatio: '9:16',
            numberOfVideos: 1
          }
        })
      }
    );

    const submitData = await submitRes.json();

    if (!submitRes.ok) {
      return res.status(400).json({ 
        error: submitData.error?.message || 'Veo API error',
        details: submitData
      });
    }

    // Veo returns an operation name for polling
    const operationName = submitData.name;
    if (!operationName) {
      return res.status(200).json({ 
        status: 'processing',
        message: 'Generation submitted.',
        raw: submitData
      });
    }

    // Poll for result (max 90 seconds - Veo takes longer)
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const pollRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/' + operationName + '?key=' + apiKey
      );
      
      const pollData = await pollRes.json();
      
      if (pollData.done) {
        // Extract video URL from response
        const videos = pollData.response?.generatedVideos || 
                       pollData.response?.videos || [];
        
        if (videos.length > 0) {
          const videoUri = videos[0].video?.uri || videos[0].uri;
          if (videoUri) {
            return res.status(200).json({ 
              url: videoUri + '?key=' + apiKey,
              status: 'completed'
            });
          }
        }
        
        return res.status(200).json({ 
          status: 'completed',
          message: 'Generation complete — check Google AI Studio.',
          raw: pollData
        });
      }

      if (pollData.error) {
        return res.status(400).json({ error: pollData.error.message });
      }
    }

    return res.status(200).json({ 
      status: 'processing',
      message: 'Still generating — Veo takes 1-3 minutes. Check Google AI Studio.',
      operation: operationName
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
