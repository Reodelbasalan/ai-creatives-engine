export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const {
      sceneNum,
      scenePrompt,
      voiceover,
      avatarDesc,
      clientName,
      product,
      brandPersonality,
      audience,
      videoSize,
      pricePoint,
      tool
    } = req.body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    }

    // ═══════════════════════════════════════
    // VEO 3 PH UGC MASTER BRAIN
    // ═══════════════════════════════════════
    const systemPrompt = `You are an ELITE Veo 3 prompt engineer specializing in ULTRA-REALISTIC Filipino UGC ads that feel naturally shot on iPhone and optimized for high conversion.

Your job is to generate a single, complete, ready-to-use video generation prompt for ONE scene of a Filipino UGC ad.

GLOBAL REALISM LOCK — MANDATORY IN EVERY PROMPT:
• Ultra photorealistic — real iPhone camera feel
• Natural Filipino skin texture, visible pores and imperfections
• Natural lighting only — soft daylight, window light
• Handheld micro-jitter, slight autofocus breathing
• Natural motion blur, casual framing imperfections
• Real-life depth of field, RAW UGC look
• 35mm / 50mm lens equivalent

MODEL CONSISTENCY — CRITICAL:
• Use ONLY the reference avatar/model described
• Maintain identical face, skin tone, hairstyle, proportions
• Natural expressions, natural blinking
• NO face drift

BRAND ALIGNMENT SYSTEM:
• Budget brand → relatable pambahay, simple casual attire
• Mid brand → clean smart casual
• Premium brand → clean minimalist, polished natural
• Beauty/aesthetics → polished natural look

ENVIRONMENT FIT (Filipino spaces):
• bahay, condo, café, office, vanity, kitchen, dining, coworking

PROP SYSTEM — always include believable props:
• phone, product packaging, receipts, laptop, delivery bags, demo items

VIDEO DYNAMISM:
• Natural movement — walking, repositioning, hand gestures, head movement
• Casual camera angle changes
• Real-life candid energy

STRICTLY AVOID:
• CGI, cartoon look, HDR over-sharpening
• Fake cinematic grading, beauty filters, plastic skin
• Studio perfection, gimbal smoothness, artificial glow
• Robotic or scripted feel

MASTER REALISM TRIGGER — always append at the end:
"Captured as a real iPhone video frame, natural lighting, casual handheld framing, slight imperfections, visible pores, natural skin texture, candid moment, unpolished, no retouching, no filters, shallow depth of field, subtle grain, handheld micro-jitter, natural focus and exposure shifts."

NEGATIVE PROMPT — always include at the end:
"Negative: AI look, CGI, cartoon, plastic skin, beauty filter, over-smooth skin, artificial glow, distorted face, warped hands, extra fingers, subtitles, text overlays, logos, watermarks, studio lighting, gimbal smooth, fake cinematic."

OUTPUT: Return ONLY the video prompt — no explanations, no headers, no JSON. Just the raw prompt text ready to paste into ${tool || 'Higgsfield'}.`;

    const userMessage = `Generate a video prompt for Scene ${sceneNum} of this Filipino UGC ad:

AVATAR/MODEL: ${avatarDesc || 'Filipino woman, 25-35 years old, natural look'}
BRAND: ${clientName || 'Filipino brand'}
PRODUCT: ${product || 'beauty/wellness product'}
TARGET AUDIENCE: ${audience || 'Filipino women 25-40'}
PRICE POINT: ${pricePoint || 'Mid'}
BRAND PERSONALITY: ${brandPersonality || 'Friendly, relatable, trustworthy'}
VIDEO SIZE: ${videoSize || '9:16 vertical'}
VIDEO TOOL: ${tool || 'Higgsfield'}

SCENE ${sceneNum} VISUAL: ${scenePrompt || 'Model holding product, natural setting'}
SCENE ${sceneNum} SCRIPT/VOICEOVER: ${voiceover || 'Natural UGC talking head'}

Generate the complete optimized video prompt for this scene now.`;

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
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Claude API error' });
    }

    const prompt = data.content?.[0]?.text?.trim() || '';
    return res.status(200).json({ success: true, prompt });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
