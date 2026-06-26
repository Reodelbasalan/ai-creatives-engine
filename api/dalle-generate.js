export const maxDuration = 60; // Vercel max timeout = 60s

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const {
      prompt, size = '1024x1024', type = 'scene',
      product, brandType, avatarDesc, tone, sceneNum
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const characterDesc = avatarDesc || 'Filipino woman, 25-32 years old, morena light brown skin, long dark brown hair, natural minimal makeup, warm brown eyes, oval face';
    const CHARACTER_LOCK = `The person must look like: ${characterDesc}. Same face, skin tone, hair. Consistent appearance.`;

    const getBrandAttire = (b, n) => {
      b = (b||'').toLowerCase(); n = n||1;
      if(b.includes('beauty')||b.includes('skin')||b.includes('aesthetics')||b.includes('clinic')){
        const a=['soft white ribbed tank top, minimal gold jewelry','light beige spaghetti strap top, hair down','cozy cream knit top, gold hoop earrings','white button-down shirt slightly open','nude bodysuit, hair loosely tied','simple white crop top, small gold necklace'];
        return a[(n-1)%a.length];
      }
      if(b.includes('food')||b.includes('cafe')){
        const a=['casual white t-shirt and jeans','colorful casual blouse','oversized shirt hair in bun','casual sundress'];
        return a[(n-1)%a.length];
      }
      const a=['casual white top, everyday relaxed look','simple comfortable t-shirt','casual blouse, approachable','cozy home outfit'];
      return a[(n-1)%a.length];
    };

    const getBackground = (b, n) => {
      b = (b||'').toLowerCase(); n = n||1;
      if(b.includes('beauty')||b.includes('skin')||b.includes('aesthetics')||b.includes('clinic')){
        const bg=['Filipino bedroom vanity, warm morning light, skincare on dresser','minimalist bathroom, white tiles, natural light','cozy living room couch, warm afternoon light','bedroom window seat, golden hour light, indoor plants','modern condo, floor-to-ceiling window','clean kitchen counter, morning light'];
        return bg[(n-1)%bg.length];
      }
      if(b.includes('food')||b.includes('cafe')){
        const bg=['Filipino home dining table, natural light','cozy local cafe, warm ambient light','home kitchen, bright and clean','outdoor garden or porch'];
        return bg[(n-1)%bg.length];
      }
      const bg=['cozy Filipino living room, warm window light, plants','modern Filipino condo, soft natural light','local cafe, warm amber lighting, wooden furniture','Filipino bedroom, morning light','home office corner, natural light','outdoor Filipino home, small garden'];
      return bg[(n-1)%bg.length];
    };

    const attire = getBrandAttire(brandType, sceneNum);
    const background = getBackground(brandType, sceneNum);
    const MASTER = "Shot on iPhone, natural window light, slight imperfections, visible pores, natural skin, candid moment, RAW look, no filters, shallow depth of field.";

    let finalPrompt;
    if(type === 'avatar'){
      finalPrompt = `Ultra-realistic 4K Filipino UGC model photo. ${CHARACTER_LOCK} Wearing: ${attire}. Background: ${background}. Natural lighting only, visible pores, natural skin, baby hairs, candid relaxed expression. Relatable Filipino morena look. ${prompt} ${MASTER}`;
    } else {
      finalPrompt = `Ultra-realistic Filipino UGC ad scene, real iPhone photo. ${CHARACTER_LOCK} Wearing: ${attire}. Background: ${background}. Natural ambient lighting. ${product?`Product: ${product}, held naturally.`:''} Authentic Filipino UGC, NOT staged. ${prompt} ${MASTER}`;
    }

    const imageSize = size === '1024x1024' ? '1024x1024' : '1024x1536';

    // ─── Call gpt-image-1 with medium quality (faster, avoids timeout) ───
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: finalPrompt,
        n: 1,
        size: imageSize,
        quality: 'medium'  // faster than 'high', avoids 504 timeout
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'OpenAI API error' });
    }

    const base64Image = data.data?.[0]?.b64_json;
    if (!base64Image) return res.status(500).json({ error: 'No image generated' });

    // ─── Upload to Supabase via REST (no SDK needed) ───
    if (supabaseUrl && supabaseKey) {
      try {
        const buffer = Buffer.from(base64Image, 'base64');
        const fileName = `gen-${type}-${Date.now()}.png`;
        const bucketName = 'Ai creatives system storage';
        const filePath = `images/${fileName}`;

        const uploadRes = await fetch(
          `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucketName)}/${filePath}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'image/png',
              'x-upsert': 'true'
            },
            body: buffer
          }
        );

        if (uploadRes.ok) {
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucketName)}/${filePath}`;
          return res.status(200).json({ success: true, url: publicUrl, mode: 'gpt-image-1' });
        }
        const errText = await uploadRes.text();
        console.log('Storage upload failed:', errText);
      } catch(e) {
        console.log('Storage error:', e.message);
      }
    }

    // ─── Fallback: base64 data URL ───
    return res.status(200).json({
      success: true,
      url: `data:image/png;base64,${base64Image}`,
      mode: 'gpt-image-1-base64'
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
