export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const {
      prompt, size = '1024x1536', type = 'scene',
      product, avatarDesc, sceneNum, avatarUrl
    } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

    // ── Aspect ratio mula sa size ──
    const aspectRatio = size === '1024x1024' ? '1:1' : '9:16';

    // ── Build ng parts: reference image muna (kung meron), tapos prompt ──
    const parts = [];
    let hasReference = false;

    if (type === 'scene') {
      if (!avatarUrl) {
        return res.status(400).json({ error: 'No avatar reference — approve an avatar first before generating scenes.' });
      }
      try {
        const refResp = await fetch(avatarUrl);
        if (!refResp.ok) throw new Error('Avatar fetch failed: ' + refResp.status);
        const refArrayBuf = await refResp.arrayBuffer();
        const refMime = refResp.headers.get('content-type') || 'image/png';
        const refB64 = Buffer.from(refArrayBuf).toString('base64');
        parts.push({ inline_data: { mime_type: refMime, data: refB64 } });
        hasReference = true;
      } catch (e) {
        return res.status(400).json({ error: 'Avatar reference unreachable: ' + e.message + ' — regenerate or re-upload the avatar.' });
      }
    } 
    
    // ── Prompt construction ──
    let finalPrompt;
    if (hasReference) {
      finalPrompt = [
        "IDENTITY LOCK — 100% CONSISTENCY REQUIRED: The provided reference image shows a REAL, SPECIFIC person. Generate a NEW photo of this EXACT SAME individual.",
        "PRESERVE WITH ZERO DEVIATION: same gender, same face shape and width, same eyes, same eyebrows, same nose, same lips, same jawline, same skin tone, same hair color and hairstyle, same body type and build. Every part of the face and body must match the reference exactly.",
        "Do NOT beautify, slim, youthen, change gender, or idealize. Keep every natural imperfection.",
        "Keep the SAME outfit and clothing as the reference unless the scene explicitly requires otherwise.",
        "ONLY change: the background/setting, the person's pose and action, and any props they hold.",
        "Scene: " + prompt + (product ? " Product they are holding or showing: " + product + "." : ""),
        "Output style: ultra realistic RAW candid iPhone photo, natural available light, visible pores, natural skin texture, unedited UGC look.",
        aspectRatio === '9:16' ? "Vertical 9:16 portrait orientation, mobile-optimized framing." : "Square 1:1 framing."
      ].join(' ');
    } else {
      // Avatar/master generation o walang reference
      finalPrompt = [
        prompt,
        avatarDesc || '',
        "RAW candid photo, natural window lighting, realistic, visible pores, natural skin texture, photorealistic.",
        aspectRatio === '9:16' ? "Vertical 9:16 portrait orientation." : "Square 1:1 framing."
      ].filter(Boolean).join(' ');
    }

    parts.push({ text: finalPrompt });

    // ── Gemini API call (Nano Banana = gemini-2.5-flash-image) ──
    const gemResp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + geminiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: parts }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: aspectRatio }
          }
        })
      }
    );

    const gemData = await gemResp.json();

    if (!gemResp.ok) {
      const errMsg = gemData?.error?.message || 'Gemini API error ' + gemResp.status;
      return res.status(gemResp.status).json({ error: errMsg });
    }

    // ── Kunin ang image mula sa response ──
    const candParts = gemData?.candidates?.[0]?.content?.parts || [];
    const imgPart = candParts.find(p => p.inlineData || p.inline_data);
    if (!imgPart) {
      return res.status(500).json({ error: 'No image returned by Nano Banana', detail: JSON.stringify(gemData).slice(0, 300) });
    }
    const imgData = imgPart.inlineData || imgPart.inline_data;
    const b64 = imgData.data;
    const mime = imgData.mimeType || imgData.mime_type || 'image/png';

    // ── Ibalik bilang data URL (same shape ng dalle response: d.url) ──
    return res.status(200).json({
      url: 'data:' + mime + ';base64,' + b64,
      usedFaceLock: hasReference,
      model: 'nano-banana'
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
