export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { provider, apiKey } = req.body;
    if (!provider) return res.status(400).json({ ok: false, error: 'Provider required' });
    if (!apiKey)   return res.status(400).json({ ok: false, error: 'API key required' });

    // ── OPENAI ──
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (r.ok) return res.status(200).json({ ok: true });
      const e = await r.json().catch(() => ({}));
      return res.status(200).json({ ok: false, error: e?.error?.message || `HTTP ${r.status}` });
    }

    // ── GROK (xAI) ──
    if (provider === 'grok') {
      const r = await fetch('https://api.x.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (r.ok) return res.status(200).json({ ok: true });
      const e = await r.json().catch(() => ({}));
      return res.status(200).json({ ok: false, error: e?.error || `HTTP ${r.status}` });
    }

    // ── GOOGLE GEMINI / VEO ──
    if (provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      if (r.ok) return res.status(200).json({ ok: true });
      const e = await r.json().catch(() => ({}));
      return res.status(200).json({ ok: false, error: e?.error?.message || `HTTP ${r.status}` });
    }

    return res.status(400).json({ ok: false, error: 'Unknown provider' });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
