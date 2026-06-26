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
    // HYPER-REALISM ENGINE v3
    // Goal: looks like a real candid iPhone photo
    // NOT a generated image, NOT a stock photo
    // ═══════════════════════════════════════

    const AVATAR_BRAIN = [

      // WHAT IT IS
      "A genuine candid smartphone photo of a real Filipino person.",
      "This is NOT generated art. This is NOT a stock photo. This is NOT a model shoot.",
      "This looks like someone pulled out their iPhone and snapped a quick photo of a real person in their home.",

      // SKIN — most important
      "Skin looks genuinely human: slight oiliness on nose and forehead, visible individual pores especially on cheeks and nose, faint acne marks or small blemishes, natural uneven skin tone, visible fine hairs on face, realistic lip texture with slight dryness or natural lip lines.",

      // FACE IMPERFECTIONS
      "Face has natural human imperfections: one side slightly different from the other, slightly uneven eyebrows, realistic eye whites with faint natural veins, natural eyelid crease, hair not perfectly styled with loose strands and flyaways.",

      // EXPRESSION — NOT posed
      "Expression is completely natural and unposed: person is mid-action or mid-thought, not looking at camera OR looking at camera with genuine unselfconscious expression, mouth slightly relaxed not forced smile.",

      // CAMERA PHYSICS
      "Shot on iPhone 15 Pro. 26mm equivalent lens. Natural bounce light from window. Slight lens softness at edges. Imperceptible camera shake. Authentic JPEG compression artifacts. No post-processing. No Lightroom. No filters.",

      // ENVIRONMENT
      "Background is a real Filipino home or local space: visible real furniture, slight mess or lived-in details, natural shadows from window light, dust or texture on surfaces visible.",

      // LIGHTING — natural only
      "Lighting is ambient natural only: soft window light from one side, realistic shadow falloff, natural skin subsurface scattering, no fill lights, no ring light, no professional lighting setup.",

    ].join(" ");

    // MASTER REALISM TRIGGER — from UGC Model Forge AI
    const MASTER_TRIGGER = "Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior.";

    // AGGRESSIVE NEGATIVE
    const NEGATIVE = [
      "AVOID COMPLETELY:",
      "AI-generated look, CGI, 3D render, digital art, illustration, anime, cartoon.",
      "Stock photo perfection, model shoot, professional photography, studio lighting.",
      "Beauty filter, skin smoothing, plastic skin, porcelain skin, perfect symmetry.",
      "Overly sharp image, HDR, oversaturated, high contrast processing.",
      "Perfect hair, perfect makeup, fashion styling, magazine quality.",
      "Artificial glow, catchlights that look fake, unnaturally white teeth.",
      "Extra fingers, distorted hands, morphed features.",
      "Text, watermarks, logos, overlays.",
    ].join(" ");

    const SCENE_BRAIN = [
      "Real candid iPhone photo of a Filipino person in an authentic everyday Filipino environment.",
      "Looks like a real UGC creator filmed this casually — not staged, not lit professionally.",
      "Filipino home, condo, local café, or everyday space with real props and natural clutter.",
      "Natural window or ambient lighting only. Person looks real, not like a model.",
      "Brand product present naturally in scene — held casually or on surface nearby.",
      "Slightly imperfect framing, natural depth of field, authentic Filipino UGC energy.",
    ].join(" ");

    let enhancedPrompt;
    if (type === 'avatar') {
      enhancedPrompt = AVATAR_BRAIN + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
    } else {
      enhancedPrompt = SCENE_BRAIN + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
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
          output_quality: 90,
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
