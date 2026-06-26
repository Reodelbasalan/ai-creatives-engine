export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024', type = 'scene' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set in Vercel env vars' });

    const REALISM_SUFFIX = ` Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior. Negative: AI look, CGI, cartoon, plastic skin, beauty filter, over-smooth skin, artificial glow, distorted face, warped hands, extra fingers, text overlays, logos, watermarks.`;

    const AVATAR_PREFIX = `Ultra-realistic 4K Filipino UGC human model, indistinguishable from real smartphone photo. iPhone-quality camera, 35mm lens, natural shallow depth of field, slightly imperfect focus. Natural lighting only — window light, soft daylight, realistic shadows. Slight grain, RAW unprocessed feel. Visible pores, natural skin texture, no smoothing, slight facial asymmetry, baby hairs, flyaway strands, faint under-eye circles, natural lips. Candid natural expression, micro-expressions. Slightly imperfect framing, handheld camera feel. Filipino UGC ad model, relatable Pinay look, emotion-driven, scroll-stopping but natural. `;

    const SCENE_PREFIX = `Ultra-realistic Filipino UGC ad scene, iPhone camera feel, 35mm lens, natural shallow depth of field. Real Filipino environment — lived-in bahay, condo, café, vanity, kitchen, or office with natural clutter. Natural lighting only — window light, soft daylight, realistic shadows. Filipino model in scene must look consistent — same face, skin tone, hairstyle, natural expression, visible pores, no beauty filter. Brand-aligned attire — casual pambahay for budget, clean minimalist for premium, polished natural for beauty. Include believable props — product packaging, phone, receipts, demo items. Slightly imperfect framing, handheld camera feel, candid moment. Real Filipino UGC creator energy — authentic, not staged. `;

    const enhancedPrompt = type === 'avatar'
      ? AVATAR_PREFIX + prompt + REALISM_SUFFIX
      : SCENE_PREFIX + prompt + REALISM_SUFFIX;

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
      return res.status(response.status).json({ error: data.detail || data.error || 'Replicate API error' });
    }

    const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!imageUrl) return res.status(500).json({ error: 'No image generated' });

    return res.status(200).json({ success: true, url: imageUrl });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
