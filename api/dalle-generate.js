export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set in Vercel env vars' });
    }

    // ═══════════════════════════════════════
    // UGC MODEL FORGE AI — REALISM ENGINE
    // Injected from custom GPT system prompt
    // ═══════════════════════════════════════
    const REALISM_PREFIX = `Ultra-realistic 4K–8K human model, indistinguishable from a real smartphone photo. iPhone-quality camera, 35mm lens equivalent, natural shallow depth of field, slightly imperfect focus. Natural lighting only — window light or soft daylight, realistic shadow behavior under chin, nose, neck. Slight grain, RAW unprocessed feel, natural dynamic range. Visible pores, natural skin texture, no smoothing, slight asymmetry, baby hairs and flyaway strands, faint under-eye circles, natural lips. Candid natural expression, micro-expressions, unpolished real-life moment. Slightly imperfect framing, handheld camera feel, lived-in background with natural clutter. STRICTLY NO: plastic skin, AI glow, perfect symmetry, studio lighting, CGI look, beauty filter, HDR overkill. Filipino UGC ad model, relatable Pinay/Filipino look, emotion-driven, scroll-stopping but natural. `;

    const REALISM_SUFFIX = ` Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior.`;

    // Build enhanced prompt
    const enhancedPrompt = REALISM_PREFIX + prompt + REALISM_SUFFIX;

    // Use Flux 1.1 Pro — best quality image model on Replicate
    const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        input: {
          prompt: enhancedPrompt,
          aspect_ratio: size === '1024x1024' ? '1:1' : '9:16',
          output_format: 'jpg',
          output_quality: 95,
          safety_tolerance: 2
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.detail || data.error || 'Replicate API error'
      });
    }

    // Get the output URL
    const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!imageUrl) {
      return res.status(500).json({ error: 'No image generated' });
    }

    return res.status(200).json({
      success: true,
      url: imageUrl
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
