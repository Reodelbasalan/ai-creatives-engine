export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const {
      prompt, size = '1024x1024', type = 'scene',
      product, brandType, avatarDesc, tone, sceneNum, avatarUrl
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // ═══════════════════════════════════════
    // PRODUCT SANITIZER — kung ang product field ay mukhang intake/form
    // text (mahaba, may URL, may form-question words), HUWAG isama sa
    // prompt. Kung isasama 'yon, iginuguhit ng AI na hawak ng tao ang
    // papel na may nakasulat na form text sa BAWAT scene.
    // ═══════════════════════════════════════
    let productClean = (product || '').trim();
    if (
      productClean.length > 120 ||
      /https?:\/\//i.test(productClean) ||
      /\n/.test(productClean) ||
      /editor assign|client name|order\s+(june|jan|feb|mar|apr|may|jul|aug|sep|oct|nov|dec)|page name|website link|voice actor|main goal|input here/i.test(productClean)
    ) {
      productClean = '';
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // ═══════════════════════════════════════
    // CHARACTER LOCK — detailed physical desc
    // Extracted from avatarDesc for consistency
    // ═══════════════════════════════════════
    const characterDesc = avatarDesc
      ? avatarDesc
      : 'Filipino woman, 25-30 years old, morena warm brown skin, long dark brown wavy hair, natural minimal makeup, soft warm brown eyes, oval face, natural lips, petite build';

    const CHARACTER_LOCK = `CHARACTER CONSISTENCY REQUIRED: The woman in this image MUST look like this specific person: ${characterDesc}. Lock these features: same face structure, same skin tone, same hair color and length, same eye shape. Do NOT change her appearance. This is the same character across all scenes.`;

    // ═══════════════════════════════════════
    // CHARACTER-DESCRIPTION STRIPPER (FACE-LOCK MODE)
    // Kapag may reference image (avatarUrl), ang MUKHA at DAMIT ay
    // 100% galing sa reference. Kaya i-strip natin ang anumang
    // paglalarawan ng tao sa scene prompt (age, gender, smile, attire)
    // para HINDI mag-conflict sa reference at magbago ang mukha.
    // Ang matitira: eksena, aksyon, background, lighting, composition.
    // ═══════════════════════════════════════
    function stripCharacterDesc(text) {
      if (!text) return '';
      return text
        // "professional Filipina businesswoman", "young Filipino man", etc.
        .replace(/\b(professional\s+|young\s+|beautiful\s+|attractive\s+)?(filipina|filipino|pinay|pinoy|asian|businesswoman|businessman|woman|man|lady|girl|guy|male|female|model|person)\b/gi, '')
        // "age 28", "25 years old", "28-year-old"
        .replace(/\b(age\s+\d+|\d+\s*years?\s*old|\d+[- ]year[- ]old)\b/gi, '')
        // facial/expression descriptors: "confident smile", "direct eye contact", "warm expression"
        .replace(/\b(confident|warm|friendly|bright|genuine|soft|natural|curious|inviting|subtle)?\s*(smile|smiling|eye contact|expression|gaze|looking at camera|face|facial)\b[^,.]*/gi, '')
        // attire (outfit-lock na galing reference): "business casual attire", "wearing blazer"
        .replace(/\b(business casual|blazer|attire|outfit|wearing|dressed in|clothing|jewelry|makeup)\b[^,.]*/gi, '')
        // skin/hair descriptors that fight the reference
        .replace(/\b(morena|fair skin|warm brown skin|long (dark )?(brown |black )?(wavy |straight )?hair|petite build)\b[^,.]*/gi, '')
        // Linisin: double commas, leading commas, extra spaces
        .replace(/\s*,\s*(,\s*)+/g, ', ')
        .replace(/^[\s,]+/, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+,/g, ',')
        .trim();
    }

    // ═══════════════════════════════════════
    // BRAND-AWARE ATTIRE — per scene rotation
    // ═══════════════════════════════════════
    const getBrandAttire = (b, n) => {
      b = (b||'').toLowerCase(); n = n||1;
      if(b.includes('beauty')||b.includes('skin')||b.includes('aesthetics')||b.includes('clinic')){
        const a=[
          'soft white ribbed tank top, minimal gold hoop earrings, dewy natural skin',
          'light beige spaghetti strap camisole, hair down naturally, no heavy makeup',
          'cozy cream knit crop top, delicate gold necklace, glowing skin',
          'white linen button-down slightly open, relaxed confident look',
          'nude seamless bodysuit, hair in loose bun, natural dewy glow',
          'simple white cropped tee, small gold stud earrings, fresh clean look'
        ];
        return a[(n-1)%a.length];
      }
      if(b.includes('food')||b.includes('cafe')||b.includes('restaurant')){
        const a=[
          'casual white t-shirt and high-waist jeans, relaxed everyday look',
          'colorful floral casual blouse, comfortable and cheerful',
          'oversized pastel shirt, hair in messy bun, cozy kitchen vibe',
          'casual sundress, bright and approachable, summer feel'
        ];
        return a[(n-1)%a.length];
      }
      if((b||'').includes('fashion')||(b||'').includes('clothing')){
        const a=[
          'trendy cropped top and high-waist jeans, stylish casual Filipino fashion',
          'chic minimalist co-ord set, modern and put-together',
          'ootd-worthy casual outfit, fashion-forward but accessible'
        ];
        return a[(n-1)%a.length];
      }
      // Default general UGC
      const a=[
        'casual white or light-colored top, everyday relaxed Filipino look',
        'simple comfortable fitted tee, natural effortless styling',
        'casual relaxed blouse, approachable and relatable everyday look',
        'cozy but cute home outfit, authentic Filipino creator vibe'
      ];
      return a[(n-1)%a.length];
    };

    // ═══════════════════════════════════════
    // SCENE-RELEVANT BACKGROUND
    // Changes per scene number + brand type
    // ═══════════════════════════════════════
    const getBackground = (b, n) => {
      b = (b||'').toLowerCase(); n = n||1;
      if(b.includes('beauty')||b.includes('skin')||b.includes('aesthetics')||b.includes('clinic')){
        const bg=[
          'Filipino bedroom vanity corner, warm morning sunlight from window, skincare products and mirror on dresser, cozy and personal',
          'bright clean bathroom, white subway tiles, soft natural window light, clean and refreshing atmosphere',
          'cozy living room sofa, warm golden afternoon light, soft throw pillows, indoor plants visible',
          'bedroom window seat nook, soft golden hour sunlight, sheer curtains, potted plants, dreamy intimate feel',
          'modern Filipino condo unit, large floor-to-ceiling window, soft natural daylight, city skyline softly blurred',
          'clean bright kitchen counter, fresh morning light, minimal clutter, warm and inviting domestic setting'
        ];
        return bg[(n-1)%bg.length];
      }
      if(b.includes('food')||b.includes('cafe')){
        const bg=[
          'Filipino home dining area, wooden table, warm window light, homey and inviting',
          'cozy local Filipino cafe, warm ambient lighting, wooden chairs, coffee and pastries on table',
          'bright home kitchen, clean countertop, natural window light, cooking tools in background',
          'outdoor garden or home porch, natural green plants, warm natural daylight'
        ];
        return bg[(n-1)%bg.length];
      }
      // Default variety of Filipino spaces
      const bg=[
        'cozy Filipino living room, warm window light from the side, indoor plants, lived-in authentic feel',
        'modern Filipino condo, soft diffused natural light, minimalist clean decor, airy atmosphere',
        'local neighborhood cafe, warm amber pendant lighting, wooden furniture, authentic Filipino vibe',
        'cozy Filipino bedroom, soft morning light streaming through curtains, comfortable personal space',
        'home office corner, bright natural window light, laptop and desk plants, casual productive atmosphere',
        'outdoor Filipino home garden or small porch, natural warm daylight, tropical plants in background'
      ];
      return bg[(n-1)%bg.length];
    };

    const attire = getBrandAttire(brandType, sceneNum);
    const background = getBackground(brandType, sceneNum);

    const MASTER_TRIGGER = "Shot on iPhone 15 Pro, natural window lighting, slight imperfections, visible pores, natural skin texture, candid authentic moment, unpolished RAW look, no filters, no retouching, shallow depth of field, subtle grain, real-life lighting.";

    const NEGATIVE = "NOT: AI-generated look, plastic skin, beauty filter, studio lighting, perfect symmetry, fashion shoot, stock photo, CGI, over-edited, overly perfect.";

    let finalPrompt;

    if(type === 'avatar'){
      finalPrompt = [
        "Ultra-realistic 4K Filipino UGC model photo, indistinguishable from a real iPhone snapshot.",
        CHARACTER_LOCK,
        `She is wearing: ${attire}.`,
        `Setting: ${background}.`,
        "Natural lighting ONLY — soft window light, realistic skin subsurface, shadow under chin and nose.",
        "Skin details: visible pores, natural uneven skin tone, faint blemishes, baby hairs, slight facial asymmetry.",
        "Expression: natural relaxed candid look, not posed, genuine micro-expression.",
        "Relatable Filipino morena look, ad-ready scroll-stopping UGC creator energy.",
        prompt,
        MASTER_TRIGGER,
        NEGATIVE
      ].join(" ");
    } else {
      // SCENE — use actual blueprint scene details as the core
      finalPrompt = [
        "Ultra-realistic Filipino UGC ad scene photo, real iPhone candid quality.",
        CHARACTER_LOCK,
        `She is wearing: ${attire}.`,
        `Background setting: ${background}.`,
        "Natural ambient or window lighting ONLY — no studio, no ring light, no artificial setup.",
        productClean ? `Brand product featured: ${productClean} — held naturally in hand or placed casually nearby, visible but not forced.` : '',
        // *** KEY FIX — actual blueprint scene prompt goes here ***
        `Scene details from script: ${prompt}`,
        "Slightly imperfect handheld framing, natural depth of field, authentic Filipino UGC creator energy.",
        "NOT staged, NOT commercially lit, NOT over-edited. Looks like real creator content.",
        MASTER_TRIGGER,
        NEGATIVE
      ].filter(Boolean).join(" ");
    }

    const imageSize = size === '1024x1024' ? '1024x1024' : '1024x1536';

    // ═══════════════════════════════════════
    // FACE LOCK (Level 2) — if an approved avatar image is provided,
    // use it as a VISUAL REFERENCE via the image EDITS endpoint
    // (image-to-image). This keeps the SAME FACE across every scene.
    // Falls back to plain text-to-image if no avatar or fetch fails.
    // ═══════════════════════════════════════
    let response;
    let usedFaceLock = false;
    let refFetchError = null;

    // Accept BOTH a base64 data URL and an http(s) URL as the reference.
    // (When Supabase storage upload fails, the avatar comes as a data URL —
    // we must still be able to use it for face-lock.)
    const isDataUrl = typeof avatarUrl === 'string' && avatarUrl.startsWith('data:image');
    const isHttpUrl = typeof avatarUrl === 'string' && /^https?:\/\//.test(avatarUrl);

    if (avatarUrl && (isDataUrl || isHttpUrl)) {
      try {
        let refBuf = null;
        let refMime = 'image/png';
        if (isDataUrl) {
          const mimeMatch = avatarUrl.match(/^data:(image\/\w+)/);
          if (mimeMatch) refMime = mimeMatch[1];
          const b64 = avatarUrl.split(',')[1] || '';
          if (b64) refBuf = Buffer.from(b64, 'base64');
          else refFetchError = 'Avatar data URL was empty.';
        } else {
          const refResp = await fetch(avatarUrl);
          if (refResp.ok) {
            refBuf = Buffer.from(await refResp.arrayBuffer());
            // Detect actual MIME from response header (di na hardcoded PNG)
            const ct = refResp.headers.get('content-type');
            if (ct && /^image\/(png|jpe?g|webp)/i.test(ct)) refMime = ct.split(';')[0].trim();
          } else {
            refFetchError = 'Could not fetch approved avatar image (HTTP ' + refResp.status + '). Is the storage bucket public?';
          }
        }
        if (refBuf) {
          // ═══════════════════════════════════════
          // MINIMAL-DELTA LOCK — pass the master reference and ONLY
          // change background / action / prop. Keep the SAME outfit +
          // SAME face to minimize what the model regenerates → tightest
          // face lock. 100% reference-driven, zero hardcoded identity.
          //
          // CRITICAL FIX: i-STRIP ang character description mula sa scene
          // prompt. Kung iiwan ang "professional Filipina, age 28,
          // confident smile", nakikipag-away 'yon sa reference image at
          // nagbabago ang mukha per scene. Ang reference lang ang bahala
          // sa mukha at damit — ang prompt ay para sa EKSENA lang.
          // ═══════════════════════════════════════
          const sceneOnly = stripCharacterDesc(prompt);

          const editPrompt = [
            // ── MAXIMUM IDENTITY LOCK ──
            "CRITICAL: The person in the reference image is a REAL specific individual. Reproduce their face with photographic, biometric accuracy — treat this like a photo of the same person taken on a different day, NOT a new character inspired by them.",
            "PRESERVE EXACTLY, pixel-for-pixel where possible: the exact face geometry, exact distance between the eyes, exact nose shape and width, exact lip shape and thickness, exact jawline and chin, exact cheekbone structure, exact eyebrow shape and thickness, exact eye shape and color, exact hairline shape, exact hairstyle and hair length, exact skin tone and undertone, exact age, exact facial hair if any, and all unique features like moles, freckles, or asymmetries.",
            "The face in the output MUST be recognizable as the same person by facial-recognition standards. Do NOT beautify, slim, youthen, lighten, or 'improve' the face in any way. Keep every imperfection.",
            "Keep the SAME outfit / clothing as the reference person — same style, same color, same collar and neckline.",
            "ONLY change these four things: (1) the background/setting, (2) the person's body pose, action and hand gesture, (3) any prop or product they hold, (4) the camera framing/angle. Everything about the person's identity stays locked.",
            background ? `New background/setting for this scene: ${background}.` : '',
            productClean ? `Prop/product they are holding or showing: ${productClean}.` : '',
            sceneOnly ? `Scene action and setting: ${sceneOnly}.` : `Scene action: ${prompt}.`,
            "Output style: RAW candid iPhone photo, natural available light, realistic, visible pores, natural skin texture, unedited UGC look.",
            "NEGATIVE (must avoid): different face, different person, new face, younger face, older face, slimmer face, rounder face, lighter skin, different skin tone, different hairstyle, different hair length, generic influencer face, model face, plastic skin, over-smoothed skin, airbrushed, beauty filter, face retouching, symmetrical perfect face, AI face, cartoon, 3D render, different eye color, different nose."
          ].filter(Boolean).join(' ');

          const ext = refMime === 'image/jpeg' ? 'jpg' : (refMime === 'image/webp' ? 'webp' : 'png');
          const form = new FormData();
          form.append('model', 'gpt-image-1');
          form.append('prompt', editPrompt);
          form.append('size', imageSize);
          // quality:medium — mas mabilis, iwas 504 Gateway Timeout (60s Vercel limit).
          // Ang FACE-LOCK ay galing sa input_fidelity:high, HINDI sa quality —
          // kaya bumibilis tayo nang hindi nasasakripisyo ang mukha.
          form.append('quality', 'medium');
          form.append('input_fidelity', 'high');
          form.append('n', '1');
          form.append('image', new Blob([refBuf], { type: refMime }), 'avatar.' + ext);
          response = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}` },
            body: form
          });
          if (response.ok) usedFaceLock = true; // only true on SUCCESS
        }
      } catch (e) {
        refFetchError = 'Avatar reference error: ' + e.message;
      }
    }

    // ═══════════════════════════════════════
    // NO SILENT FALLBACK FOR SCENES (GPT's key fix).
    // A scene MUST use the face-lock. If the avatar is missing or the
    // reference fetch failed, we return a LOUD error instead of quietly
    // generating a brand-new (different) face from text.
    // Text-to-image fallback is allowed ONLY for avatar generation.
    // ═══════════════════════════════════════
    if (type === 'scene') {
      if (!avatarUrl) {
        return res.status(400).json({ error: 'Scene needs an approved avatar. Generate/upload and APPROVE an avatar first.', faceLock: false });
      }
      if (!response) {
        return res.status(400).json({ error: 'Face-lock failed — ' + (refFetchError || 'avatar reference unavailable') + '. Scene was NOT generated to avoid a different face.', faceLock: false });
      }
    }

    // Avatar (or non-scene) may fall back to text-to-image generation.
    if (!response) {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: finalPrompt,
          n: 1,
          size: imageSize,
          quality: 'medium'
        })
      });
    }

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: (data.error?.message || 'OpenAI API error') + (type==='scene' ? ' (face-lock edits call failed)' : ''), faceLock: false });
    }

    const base64Image = data.data?.[0]?.b64_json;
    if (!base64Image) return res.status(500).json({ error: 'No image generated' });

    // ─── Upload to Supabase server-side ───
    if (supabaseUrl && supabaseKey) {
      try {
        const buffer = Buffer.from(base64Image, 'base64');
        const rand = Math.random().toString(36).slice(2, 8); // anti-collision suffix
        const fileName = `gen-${type}-${sceneNum||0}-${Date.now()}-${rand}.png`;
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
          return res.status(200).json({ success: true, url: publicUrl, mode: 'gpt-image-1', faceLock: usedFaceLock });
        }
        const errText = await uploadRes.text();
        console.log('Storage failed:', errText);
      } catch(e) {
        console.log('Storage error:', e.message);
      }
    }

    // Fallback: base64
    return res.status(200).json({
      success: true,
      url: `data:image/png;base64,${base64Image}`,
      mode: 'gpt-image-1-base64',
      faceLock: usedFaceLock
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
