export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { sceneNum, scenePrompt, voiceover, avatarDesc, clientName, product, brandPersonality, audience, videoSize, pricePoint, tool } = req.body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

    const systemPrompt = `You are an ELITE Veo 3 prompt engineer specializing in ULTRA-REALISTIC Filipino UGC ads that feel naturally shot on iPhone and optimized for high conversion.

Your job: generate ONE complete ready-to-paste video prompt for a single scene.

MANDATORY RULES:
• Ultra photorealistic — real iPhone camera feel, 35mm lens
• Natural Filipino skin texture, visible pores, imperfections
• Natural lighting only — window light, soft daylight
• Handheld micro-jitter, slight autofocus breathing, natural motion blur
• Casual framing, RAW UGC look, no filters
• Use ONLY the reference avatar — same face, skin tone, hairstyle
• NO face drift, NO plastic skin, NO studio lighting, NO gimbal smoothness

BRAND ALIGNMENT:
• Budget → pambahay casual attire, relatable Filipino home setting
• Mid → smart casual, clean condo or café setting  
• Premium → minimalist, polished natural look
• Beauty → glowing natural skin, vanity or bathroom setting

ALWAYS INCLUDE believable Filipino props: product packaging, phone, receipts, delivery bags

WARDROBE: match brand — messy hair + oversized shirt for problem scenes, cleaner look for solution scenes

MASTER REALISM TRIGGER — append at end of EVERY prompt:
"Captured as a real iPhone video frame, natural lighting, casual handheld framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished, no retouching, no filters, shallow depth of field, subtle grain, handheld micro-jitter, natural focus and exposure shifts."

NEGATIVE PROMPT — always add at end:
"Negative: AI look, CGI, cartoon, plastic skin, beauty filter, artificial glow, distorted face, warped hands, extra fingers, subtitles, text overlays, logos, watermarks, studio lighting, gimbal smooth."

OUTPUT: Return ONLY the video prompt. No explanations, no headers, no JSON. Raw prompt text only.`;

    const userMessage = `Generate a video prompt for Scene ${sceneNum}:

MODEL/AVATAR: ${avatarDesc || 'Filipino woman, 25-35, natural look'}
BRAND: ${clientName || 'Filipino brand'}
PRODUCT: ${product || 'beauty/wellness product'}
AUDIENCE: ${audience || 'Filipino women 25-40'}
PRICE POINT: ${pricePoint || 'Mid'}
BRAND PERSONALITY: ${brandPersonality || 'Friendly, relatable, trustworthy'}
VIDEO SIZE: ${videoSize || '9:16 vertical'}
TOOL: ${tool || 'Higgsfield'}

SCENE ${sceneNum} VISUAL: ${scenePrompt || 'Model holding product, natural setting'}
SCENE ${sceneNum} VOICEOVER: ${voiceover || 'Natural UGC talking head'}

Generate the complete optimized video prompt now.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Claude API error' });

    const prompt = data.content?.[0]?.text?.trim() || '';
    return res.status(200).json({ success: true, prompt });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
