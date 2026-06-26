export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const {
      prompt,
      size = '1024x1024',
      type = 'scene',
      clientName,
      product,
      brandType,
      audience,
      avatarDesc,
      tone,
      sceneNum,
      totalScenes
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not set in Vercel env vars' });
    }

    // ═══════════════════════════════════════
    // CHARACTER LOCK — consistent across scenes
    // ═══════════════════════════════════════
    const characterDesc = avatarDesc || 'Filipino woman, 25-32 years old, morena light brown skin, long dark brown hair, natural minimal makeup, warm brown eyes, oval face';

    const CHARACTER_LOCK = `IMPORTANT CHARACTER CONSISTENCY: The person in this image must ALWAYS look like the same individual: ${characterDesc}. Same face shape, same skin tone, same hair. Do not change her appearance.`;

    // ═══════════════════════════════════════
    // BRAND-AWARE ATTIRE
    // ═══════════════════════════════════════
    const getBrandAttire = (brandType, tone, sceneNum) => {
      const b = (brandType || '').toLowerCase();
      const t = (tone || '').toLowerCase();
      const n = (sceneNum || 1);

      if (b.includes('beauty') || b.includes('skin') || b.includes('aesthetics') || b.includes('clinic')) {
        const attires = [
          'soft white ribbed tank top, minimal gold jewelry, dewy fresh skin',
          'light beige spaghetti strap top, hair down naturally, no heavy makeup',
          'cozy cream knit top, gold hoop earrings, glowing skin',
          'white button-down shirt slightly open, natural relaxed confident look',
          'nude bodysuit, hair loosely tied, natural dewy look',
          'simple white crop top, small gold necklace, fresh clean appearance'
        ];
        return attires[(n - 1) % attires.length];
      }

      if (b.includes('food') || b.includes('cafe') || b.includes('restaurant')) {
        const attires = [
          'casual white t-shirt and jeans, relaxed home look',
          'colorful casual blouse, comfortable and cheerful',
          'oversized shirt, hair in bun, cozy home kitchen look',
          'casual sundress, bright and approachable'
        ];
        return attires[(n - 1) % attires.length];
      }

      if (t.includes('luxury') || t.includes('premium') || t.includes('luxurious')) {
        return 'clean minimalist white or nude toned outfit, subtle luxury accessories, polished natural look';
      }

      const defaults = [
        'casual white or light-colored top, everyday relaxed Filipino creator look',
        'simple comfortable t-shirt, natural no-fuss styling',
        'casual blouse, approachable and relatable',
        'cozy home outfit, authentic and natural'
      ];
      return defaults[(n - 1) % defaults.length];
    };

    // ═══════════════════════════════════════
    // SCENE-AWARE BACKGROUND
    // ═══════════════════════════════════════
    const getBackground = (brandType, sceneNum) => {
      const b = (brandType || '').toLowerCase();
      const n = (sceneNum || 1);

      if (b.includes('beauty') || b.includes('skin') || b.includes('aesthetics') || b.includes('clinic')) {
        const bgs = [
          'Filipino bedroom vanity area, warm morning window light, skincare products on dresser',
          'bright minimalist bathroom, white tiles, clean natural light',
          'cozy living room couch, warm afternoon light, soft cushions',
          'bedroom window seat, golden hour sunlight, indoor plants visible',
          'modern condo unit, floor-to-ceiling window, city view softly blurred',
          'clean kitchen counter, morning light, bright and fresh atmosphere'
        ];
        return bgs[(n - 1) % bgs.length];
      }

      if (b.includes('food') || b.includes('cafe')) {
        const bgs = [
          'Filipino home dining table, natural window light, warm and inviting',
          'cozy local cafe, warm ambient lighting, coffee cups visible',
          'home kitchen, bright and clean, natural light',
          'outdoor garden or small porch, natural green background'
        ];
        return bgs[(n - 1) % bgs.length];
      }

      const defaults = [
        'cozy Filipino living room, warm window light, lived-in authentic feel with plants',
        'modern Filipino condo, soft natural light, minimalist clean decor',
        'local neighborhood cafe, warm amber lighting, wooden furniture',
        'Filipino bedroom, morning light streaming in, comfortable personal space',
        'home office corner, natural light, casual productive atmosphere',
        'outdoor area of Filipino home, small garden or porch, natural daylight'
      ];
      return defaults[(n - 1) % defaults.length];
    };

    const attire = getBrandAttire(brandType, tone, sceneNum);
    const background = getBackground(brandType, sceneNum);

    const MASTER_TRIGGER = "Captured as a real iPhone photo, natural window lighting, casual framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting behavior.";

    // ═══════════════════════════════════════
    // AVATAR PROMPT
    // ═══════════════════════════════════════
    const AVATAR_BRAIN = `Ultra-realistic 4K Filipino UGC model photo, indistinguishable from a real smartphone photo. ${CHARACTER_LOCK} She is wearing ${attire}. Natural lighting ONLY: soft window light, realistic shadows under chin and nose, no studio lighting. Skin: visible pores, natural texture no smoothing, small blemishes, faint under-eye circles, slight facial asymmetry, baby hairs. Natural relaxed candid expression, slightly imperfect framing. Background: ${background}. Relatable Filipino morena look, ad-ready UGC creator energy, NOT a fashion shoot.`;

    // ═══════════════════════════════════════
    // SCENE PROMPT
    // ═══════════════════════════════════════
    const SCENE_BRAIN = `Ultra-realistic Filipino UGC ad scene, real iPhone candid photo quality. ${CHARACTER_LOCK} She is wearing ${attire}. Background: ${background}. Natural window or ambient lighting only, soft realistic shadows, no studio setup. ${product ? `Product visible: ${product}, held naturally or placed organically nearby.` : ''} Slightly imperfect handheld framing, natural depth of field, authentic Filipino UGC creator energy. NOT staged, NOT professionally lit, NOT over-edited.`;

    let dallePrompt;
    if (type === 'avatar') {
      dallePrompt = AVATAR_BRAIN + ' ' + prompt + ' ' + MASTER_TRIGGER;
    } else {
      dallePrompt = SCENE_BRAIN + ' ' + prompt + ' ' + MASTER_TRIGGER;
    }

    // DALL-E 3 sizes: 1024x1024, 1024x1792, 1792x1024
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
