export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024', type = 'scene', referenceImageUrl } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set' });
    }

    const MASTER_TRIGGER = "Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior.";

    const AVATAR_BRAIN = [
      "Ultra-realistic 4K Filipino UGC model photo, indistinguishable from a real smartphone photo.",
      "Shot on iPhone 15 Pro, 35mm lens equivalent, natural shallow depth of field.",
      "Natural lighting ONLY: soft window light, realistic shadows under chin and nose. NO studio lighting.",
      "Skin: visible pores, natural texture NO smoothing, small blemishes, faint under-eye circles, slight facial asymmetry, baby hairs.",
      "Natural relaxed expression, not posed, candid feel.",
      "Slightly imperfect framing, handheld camera angle.",
      "Real Filipino home or cafe background, lived-in feel.",
      "Relatable Filipino look — morena or light morena skin tone.",
      "Ad-ready UGC creator look, scroll-stopping but natural, NOT a fashion shoot.",
    ].join(" ");

    const SCENE_BRAIN = [
      "Ultra-realistic Filipino UGC ad scene, real iPhone candid photo look.",
      "Real Filipino environment: home, condo, cafe, vanity, office with natural clutter.",
      "Natural Filipino creator — natural skin, casual brand-appropriate attire.",
      "Natural window or ambient lighting only. NO studio setup.",
      "Brand product placed naturally in scene.",
      "Slightly imperfect handheld framing, natural depth of field.",
      "NOT staged, NOT commercial shoot. Real Filipino UGC energy.",
    ].join(" ");

    let enhancedPrompt;
    if (type === 'avatar') {
      enhancedPrompt = AVATAR_BRAIN + " " + prompt + " " + MASTER_TRIGGER;
    } else {
      enhancedPrompt = SCENE_BRAIN + " " + prompt + " " + MASTER_TRIGGER;
    }

    // ─── Reference image mode (Flux Redux) ───
    if (referenceImageUrl && !referenceImageUrl.startsWith('data:')) {
      const refResponse = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
          'Prefer': 'wait'
        },
        body: JSON.stringify({
          input: {
            image: referenceImageUrl,
            prompt: enhancedPrompt,
            aspect_ratio: size === '1024x1024' ? '1:1' : '9:16',
            output_format: 'jpg',
            output_quality: 90,
            safety_tolerance: 2
          }
        })
      });
      const refData = await refResponse.json();
      if (refResponse.ok) {
        const imageUrl = Array.isArray(refData.output) ? refData.output[0] : refData.output;
        if (imageUrl) return res.status(200).json({ success: true, url: imageUrl, mode: 'reference' });
      }
    }

    // ─── Standard Flux 1.1 Pro ───
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
      return res.status(response.status).json({ error: data.detail || data.error || 'Replicate API error' });
    }

    const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!imageUrl) return res.status(500).json({ error: 'No image generated' });

    return res.status(200).json({ success: true, url: imageUrl, mode: 'flux' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
