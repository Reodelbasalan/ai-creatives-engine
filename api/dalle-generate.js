export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024', type = 'scene' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set in Vercel env vars' });
    }

    // ═══════════════════════════════════════
    // MASTER REALISM TRIGGER — appended to ALL
    // ═══════════════════════════════════════
    const REALISM_SUFFIX = ` Shot on iPhone 15 Pro, natural daylight from window, casual handheld framing, slight imperfections, visible skin pores, natural uneven skin texture, real facial asymmetry, candid unposed moment, zero filters, zero retouching, zero beauty enhancement, shallow depth of field, subtle film grain, real-life soft shadows, human imperfections present. Negative prompt: AI-generated, CGI, plastic skin, beauty filter, symmetrical perfection, studio lighting, artificial glow, over-smooth skin, fashion shoot, overly perfect, posed model, magazine look, rendered, 3D, cartoon, anime, warped hands, extra fingers, text overlays, logos, watermarks.`;

    // ═══════════════════════════════════════
    // AVATAR — UGC Model Forge AI
    // Ultra-realistic Filipino human, NOT a model
    // ═══════════════════════════════════════
    const AVATAR_PREFIX = `Hyperrealistic candid photo of a real Filipino person, 4K, indistinguishable from an actual iPhone snapshot. NOT a model, NOT a photoshoot — a real everyday person. Natural face with slight imperfections: visible pores, uneven skin tone, faint blemishes, natural under-eye area, slightly asymmetrical features, real hair with flyaways and baby hairs. Natural relaxed expression — not posed, not smiling perfectly, just existing naturally. Soft natural window light, realistic shadow falloff under nose and chin. Authentic Filipino look — morena or light morena skin tone, natural Filipino facial features. Real casual environment in background — blurred but recognizable Filipino home or café setting. Handheld iPhone camera feel — slight perspective imperfection, not perfectly centered. RAW unedited look, no beauty filter, no AI smoothing, no perfect lighting setup. `;

    // ═══════════════════════════════════════
    // SCENE — VEO 3 PH UGC System
    // Brand-aligned, real Filipino environment
    // ═══════════════════════════════════════
    const SCENE_PREFIX = `Hyperrealistic Filipino UGC ad scene, looks like a real iPhone candid photo. Real Filipino everyday environment — lived-in home, condo unit, local café, vanity corner, or small office with authentic Filipino details and natural clutter. The person in the scene must look like a real Filipino, not a model — natural skin texture, real proportions, casual attire appropriate to brand. Natural lighting from windows or ambient indoor light, realistic soft shadows. Brand-appropriate props — product packaging placed naturally, phone in hand, receipts, everyday items. Slightly imperfect framing as if handheld shot, natural depth of field, authentic UGC energy. NOT staged, NOT commercial shoot, NOT over-lit. Real Filipino creator energy. `;

    let enhancedPrompt;
    if (type === 'avatar') {
      enhancedPrompt = AVATAR_PREFIX + prompt + REALISM_SUFFIX;
    } else {
      enhancedPrompt = SCENE_PREFIX + prompt + REALISM_SUFFIX;
    }

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
          safety_tolerance: 2,
          prompt_upsampling: true
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.detail || data.error || 'Replicate API error'
      });
    }

    const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!imageUrl) {
      return res.status(500).json({ error: 'No image generated' });
    }

    return res.status(200).json({ success: true, url: imageUrl });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
