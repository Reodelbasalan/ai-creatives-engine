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

    const NEGATIVE = "AVOID: AI-generated look, CGI, stock photo perfection, studio lighting, beauty filter, plastic skin, perfect symmetry, overly sharp HDR, fashion shoot styling, artificial glow, extra fingers, distorted hands, text, watermarks, logos.";

    const AVATAR_BRAIN = "A genuine candid smartphone photo of a real Filipino person. NOT a generated image, NOT a stock photo. Skin looks genuinely human: visible pores, slight oiliness on nose, faint blemishes, natural uneven skin tone. Face has natural imperfections: slightly asymmetrical features, natural hair with flyaways. Expression is completely natural and unposed. Shot on iPhone 15 Pro, natural window light, no post-processing, no filters. Real Filipino home background with lived-in details.";

    const SCENE_BRAIN = "Real candid iPhone photo of a Filipino person in an authentic everyday Filipino environment. Genuine UGC content — not staged, not professionally lit. Filipino home, condo, local café with real props and natural clutter. Natural window or ambient lighting only. Brand product present naturally. Slightly imperfect framing, authentic Filipino UGC energy.";

    let enhancedPrompt;
    if (type === 'avatar') {
      enhancedPrompt = AVATAR_BRAIN + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
    } else {
      enhancedPrompt = SCENE_BRAIN + " " + prompt + " " + MASTER_TRIGGER + " " + NEGATIVE;
    }

    // ═══════════════════════════════════════
    // MODE A: Reference image provided
    // Use InstantID — face consistency model
    // Keeps same face across all scenes
    // ═══════════════════════════════════════
    if (referenceImageUrl && !referenceImageUrl.startsWith('data:')) {
      try {
        const instantResponse = await fetch('https://api.replicate.com/v1/models/zsxkib/instant-id/predictions', {
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
              negative_prompt: "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, plastic skin, artificial glow, studio lighting, beauty filter, CGI, rendered",
              width: size === '1024x1024' ? 1024 : 576,
              height: size === '1024x1024' ? 1024 : 1024,
              num_inference_steps: 30,
              guidance_scale: 5,
              ip_adapter_scale: 0.8,
              controlnet_conditioning_scale: 0.8,
              scheduler: "EulerDiscreteScheduler"
            }
          })
        });

        const instantData = await instantResponse.json();

        if (instantResponse.ok) {
          const imageUrl = Array.isArray(instantData.output)
            ? instantData.output[instantData.output.length - 1]
            : instantData.output;

          if (imageUrl) {
            return res.status(200).json({ success: true, url: imageUrl, mode: 'instantid' });
          }
        }
        // Log error and fall through to Flux
        console.log('InstantID failed, falling back to Flux:', instantData?.error || instantData?.detail);
      } catch (e) {
        console.log('InstantID error, falling back to Flux:', e.message);
      }
    }

    // ═══════════════════════════════════════
    // MODE B: Base64 reference — use Flux Redux
    // image-to-image with style transfer
    // ═══════════════════════════════════════
    if (referenceImageUrl && referenceImageUrl.startsWith('data:')) {
      try {
        const reduxResponse = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken}`,
            'Prefer': 'wait'
          },
          body: JSON.stringify({
            input: {
              redux_image: referenceImageUrl,
              prompt: enhancedPrompt,
              aspect_ratio: size === '1024x1024' ? '1:1' : '9:16',
              output_format: 'jpg',
              output_quality: 90,
              guidance: 3.5,
              megapixels: '1'
            }
          })
        });

        const reduxData = await reduxResponse.json();

        if (reduxResponse.ok) {
          const imageUrl = Array.isArray(reduxData.output) ? reduxData.output[0] : reduxData.output;
          if (imageUrl) {
            return res.status(200).json({ success: true, url: imageUrl, mode: 'flux-redux' });
          }
        }
        console.log('Flux Redux failed, falling back to standard Flux:', reduxData?.error);
      } catch (e) {
        console.log('Flux Redux error:', e.message);
      }
    }

    // ═══════════════════════════════════════
    // MODE C: Text only — standard Flux 1.1 Pro
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

    return res.status(200).json({ success: true, url: imageUrl, mode: 'flux-standard' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
