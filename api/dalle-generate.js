export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const {
      prompt, size = '1024x1024', type = 'scene',
      clientName, product, brandType, avatarDesc, tone, sceneNum
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const characterDesc = avatarDesc || 'Filipino woman, 25-32 years old, morena light brown skin, long dark brown hair, natural minimal makeup, warm brown eyes, oval face';
    const CHARACTER_LOCK = `The person must look like: ${characterDesc}. Same face, skin tone, hair. Consistent appearance.`;

    const getBrandAttire = (b, t, n) => {
      b = (b||'').toLowerCase(); t = (t||'').toLowerCase(); n = n||1;
      if(b.includes('beauty')||b.includes('skin')||b.includes('aesthetics')||b.includes('clinic')){
        const a=['soft white ribbed tank top, minimal gold jewelry','light beige spaghetti strap top, hair down naturally','cozy cream knit top, gold hoop earrings','white button-down shirt slightly open','nude bodysuit, hair loosely tied','simple white crop top, small gold necklace'];
        return a[(n-1)%a.length];
      }
      if(b.includes('food')||b.includes('cafe')){
        const a=['casual white t-shirt and jeans','colorful casual blouse','oversized shirt, hair in bun','casual sundress'];
        return a[(n-1)%a.length];
      }
      if(t.includes('luxury')||t.includes('premium')) return 'clean minimalist white or nude outfit, subtle luxury accessories';
      const a=['casual white top, everyday relaxed look','simple comfortable t-shirt','casual blouse, approachable','cozy home outfit, authentic'];
      return a[(n-1)%a.length];
    };

    const getBackground = (b, n) => {
      b = (b||'').toLowerCase(); n = n||1;
      if(b.includes('beauty')||b.includes('skin')||b.includes('aesthetics')||b.includes('clinic')){
        const bg=['Filipino bedroom vanity, warm morning window light, skincare products on dresser','bright minimalist bathroom, white tiles, clean natural light','cozy living room couch, warm afternoon light, soft cushions','bedroom window seat, golden hour sunlight, indoor plants','modern condo, floor-to-ceiling window, city view blurred','clean kitchen counter, morning light, bright and fresh'];
        return bg[(n-1)%bg.length];
      }
      if(b.includes('food')||b.includes('cafe')){
        const bg=['Filipino home dining table, natural window light','cozy local cafe, warm ambient lighting','home kitchen, bright and clean','outdoor garden or small porch'];
        return bg[(n-1)%bg.length];
      }
      const bg=['cozy Filipino living room, warm window light, plants and lived-in feel','modern Filipino condo, soft natural light, minimalist decor','local neighborhood cafe, warm amber lighting, wooden furniture','Filipino bedroom, morning light streaming in','home office corner, natural light, casual atmosphere','outdoor Filipino home area, small garden, natural daylight'];
      return bg[(n-1)%bg.length];
    };

    const attire = getBrandAttire(brandType, tone, sceneNum);
    const background = getBackground(brandType, sceneNum);
    const MASTER = "Shot on iPhone, natural window lighting, slight imperfections, visible pores, natural skin texture, candid moment, RAW look, no filters, shallow depth of field, subtle grain.";

    let finalPrompt;
    if(type === 'avatar'){
      finalPrompt = `Ultra-realistic 4K Filipino UGC model photo. ${CHARACTER_LOCK} Wearing: ${attire}. Background: ${background}. Natural lighting only, visible pores, natural skin texture, baby hairs, slight facial asymmetry, candid relaxed expression. Relatable Filipino morena look, NOT a fashion shoot. ${prompt} ${MASTER}`;
    } else {
      finalPrompt = `Ultra-realistic Filipino UGC ad scene, real iPhone photo quality. ${CHARACTER_LOCK} Wearing: ${attire}. Background: ${background}. Natural ambient lighting only, no studio. ${product?`Product: ${product}, held naturally.`:''} Authentic Filipino UGC energy, NOT staged. ${prompt} ${MASTER}`;
    }

    const imageSize = size === '1024x1024' ? '1024x1024' : '1024x1536';

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: finalPrompt,
        n: 1,
        size: imageSize,
        quality: 'high'
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'OpenAI API error' });
    }

    const base64Image = data.data?.[0]?.b64_json;
    if (!base64Image) return res.status(500).json({ error: 'No image generated' });

    // Return as data URL — works directly in <img> src
    const imageUrl = `data:image/png;base64,${base64Image}`;
    return res.status(200).json({ success: true, url: imageUrl, mode: 'gpt-image-1' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
