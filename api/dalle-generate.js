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
      return res.status(500).json({ error: 'REPLICATE_API_TOKEN not set in Vercel env vars' });
    }

    const MASTER_TRIGGER = "Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior.";

    const NEGATIVE = "AVOID: AI-generated look, CGI, stock photo perfection, studio lighting, beauty filter, plastic skin, perfect symmetry, overly sharp HDR, fashion shoot styling, artificial glow, extra fingers, distorted hands, text, watermarks, logos.";

    const AVATAR_BRAIN = "A genuine candid smartphone photo of a real Filipino person. NOT a generated image, NOT a stock photo. Skin looks genuinely human: visible pores, slight oiliness on nose, faint blemishes, natural uneven skin tone. Face has natural imperfections: slightly asymmetrical features, natural hair with flyaways. Expression is completely natural and unposed. Shot on iPhone 15 Pro, natural window light, no post-processing, no filters, authentic JPEG look. Real Filipino home background with lived-in details.";

    const SCENE_BRAIN = "Real candid iPhone photo of a Filipino person in an authentic everyday Filipino environment. Looks like genuine UGC content — not staged, not professionally lit. Filipino home, condo, local café with real props and natural clutter. Natural window or ambient lighting only. Brand product present naturally in scene. Slightly imperfect framing, authentic Filipino UGC energy.";

    let enhancedPrompt;
    if (type === 'avatar') {
      enhancedPrompt = AVATAR_BRAIN + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
    } else {
      enhancedPrompt = SCENE_BRAIN + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
    }

    let predictionBody;

    // ═══════════════════════════════════════
    // MODE: Reference image provided
    // Use Flux Redux (image-to-image)
    // Maintains face/look consistency
    // ═══════════════════════════════════════
    if (referenceImageUrl) {
      predictionBody = {
        input: {
          image: referenceImageUrl,
          prompt: enhancedPrompt,
          aspect_ratio: size === '1024x1024' ? '1:1' : '9:16',
          output_format: 'jpg',
          output_quality: 90,
          safety_tolerance: 2,
          image_strength: 0.75  // 0 = copy image exactly, 1 = ignore image. 0.75 = keep face/look, change scene
        }
      };

      const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
          'Prefer': 'wait'
        },
        body: JSON.stringify(predictionBody)
      });

      const data = await response.json();
      if (!response.ok) {
        // Fallback to standard Flux if Redux fails
        console.log('Flux Ultra failed, falling back to standard:', data);
      } else {
        const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        if (imageUrl) {
          return res.status(200).json({ success: true, url: imageUrl, mode: 'reference' });
        }
      }
    }

    // ═══════════════════════════════════════
    // MODE: Text-only (no reference image)
    // Standard Flux 1.1 Pro
    // ═══════════════════════════════════════
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

    return res.status(200).json({ success: true, url: imageUrl, mode: 'text-only' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
