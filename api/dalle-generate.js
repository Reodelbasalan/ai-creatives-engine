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
    // UGC MODEL FORGE AI — ELITE REALISM ENGINE
    // Source: Custom GPT system prompt (exact)
    // ═══════════════════════════════════════

    const AVATAR_PREFIX = [
      // CORE OBJECTIVE
      "Ultra-realistic 4K-8K human model photo, indistinguishable from a real person captured on a real iPhone in a real-life candid moment.",

      // CAMERA REALISM SYSTEM
      "Shot on iPhone-quality camera, 35mm or 50mm lens equivalent, natural shallow depth of field, slightly imperfect focus (NOT hyper sharp everywhere).",

      // LIGHTING — STRICT
      "Natural lighting ONLY: window light or soft daylight, mild sun exposure, soft light falloff, realistic shadow behavior under chin, nose, neck. NO studio lighting, NO artificial glow.",

      // IMAGE CHARACTERISTICS
      "Slight grain RAW unprocessed feel, natural dynamic range, no HDR overkill, slight exposure imperfections.",

      // HUMAN REALISM ENGINE — CRITICAL
      "Skin and facial details: visible pores, natural skin texture NO smoothing, small blemishes or natural imperfections, faint under-eye circles, natural lips not glossy or perfect, slight facial asymmetry face is NOT perfectly balanced, baby hairs and flyaway strands.",

      // EXPRESSION
      "Natural facial expression relaxed not posed, micro-expressions subtle emotion, slight imperfection in gaze or posture.",

      // UGC AUTHENTICITY
      "Image feels candid caught in the moment, unpolished NOT commercial-perfect, real-life scenario not staged. Slightly imperfect framing, casual handheld camera angle, real environment interaction.",

      // ENVIRONMENT
      "Background feels lived-in not empty or fake, natural clutter or imperfections, real-life environment: room, cafe, street, or office. Lighting interacts naturally with environment.",

      // ANTI-AI DETECTION — VERY STRICT
      "STRICTLY NO: plastic or overly smooth skin, unrealistic symmetry, overly perfect lighting, CGI 3D rendered look, overly sharp or HDR-heavy images, artificial glow or beauty filter, unrealistic eyes or reflections, perfect hair strands must have randomness.",

      // AD PERFORMANCE LAYER
      "Relatable Filipino look morena or light morena, emotion-driven expression, scroll-stopping but natural, message-first visual potential.",

    ].join(" ");

    // MASTER REALISM TRIGGER — EXACT from custom GPT
    const MASTER_TRIGGER = "Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior.";

    const NEGATIVE = "Negative: AI-generated, CGI, cartoon, plastic skin, beauty filter, over-smooth skin, artificial glow, unrealistic symmetry, studio lighting, HDR, over-edited, fashion shoot, posed model, magazine look, rendered, 3D, anime, distorted face, warped hands, extra fingers, text overlays, logos, watermarks, perfect hair, artificial eyes.";

    // ═══════════════════════════════════════
    // SCENE — VEO 3 PH UGC aligned
    // ═══════════════════════════════════════
    const SCENE_PREFIX = [
      "Ultra-realistic Filipino UGC ad scene photo, looks exactly like a real iPhone candid shot.",
      "Real Filipino everyday environment: lived-in home, condo, local cafe, vanity, or office with authentic Filipino details and natural clutter.",
      "Person in scene looks like a real Filipino not a model, natural skin texture, real proportions, casual brand-appropriate attire.",
      "Natural lighting from windows or ambient indoor light, realistic soft shadows, NO studio setup.",
      "Brand props placed naturally: product packaging, phone in hand, receipts, everyday items.",
      "Slightly imperfect handheld framing, natural depth of field, authentic UGC energy.",
      "NOT staged, NOT commercial shoot, NOT over-lit. Real Filipino creator energy.",
    ].join(" ");

    // Build final prompt
    let enhancedPrompt;
    if (type === 'avatar') {
      enhancedPrompt = AVATAR_PREFIX + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
    } else {
      enhancedPrompt = SCENE_PREFIX + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
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
