export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, size = '1024x1024', type = 'scene', referenceImageUrl } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not set in Vercel env vars' });
    }

    const MASTER_TRIGGER = "Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior.";

    const AVATAR_BRAIN = [
      "Ultra-realistic 4K Filipino UGC model photo, indistinguishable from a real smartphone photo.",
      "Shot on iPhone-quality camera, 35mm lens equivalent, natural shallow depth of field.",
      "Natural lighting ONLY: window light or soft daylight, realistic shadow behavior. NO studio lighting.",
      "Skin: visible pores, natural texture NO smoothing, small blemishes, faint under-eye circles, natural lips, slight facial asymmetry, baby hairs.",
      "Natural relaxed expression, not posed, slight imperfection in gaze.",
      "Candid feel, slightly imperfect framing, casual handheld camera angle.",
      "Background feels lived-in, real Filipino home or café setting.",
      "Relatable Filipino look — morena or light morena skin tone, natural Filipino facial features.",
      "Scroll-stopping but natural, NOT a fashion shoot, NOT stock photo.",
    ].join(" ");

    const SCENE_BRAIN = [
      "Ultra-realistic Filipino UGC ad scene, looks exactly like a real iPhone candid photo.",
      "Real Filipino everyday environment: lived-in home, condo, local café, vanity, or office.",
      "Person looks like a real Filipino creator — natural skin, casual attire.",
      "Natural window or ambient lighting only. NO studio setup.",
      "Brand props placed naturally: product packaging, phone, receipts.",
      "Slightly imperfect handheld framing, natural depth of field.",
      "NOT staged, NOT commercial shoot. Real Filipino UGC energy.",
    ].join(" ");

    let dallePrompt;
    if (type === 'avatar') {
      dallePrompt = AVATAR_BRAIN + " " + prompt + " " + MASTER_TRIGGER;
    } else {
      dallePrompt = SCENE_BRAIN + " " + prompt + " " + MASTER_TRIGGER;
    }

    // DALL-E 3 supported sizes: 1024x1024, 1024x1792, 1792x1024
    const dalleSize = size === '1024x1024' ? '1024x1024' : '1024x1792';

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: dallePrompt,
        n: 1,
        size: dalleSize,
        quality: 'hd'
        // NOTE: style parameter removed — not supported in all accounts
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'DALL-E API error'
      });
    }

    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: 'No image generated' });
    }

    return res.status(200).json({ success: true, url: imageUrl, mode: 'dalle-3' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
