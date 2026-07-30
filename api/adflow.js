/**
 * AdFlow licence proxy — Vercel serverless function.
 * -----------------------------------------------------------------------------
 * Sits between the admin dashboard and the Cloudflare licence Worker.
 *
 * Why it exists: `ai-creatives-engine` is a PUBLIC repo. If the dashboard
 * called the Worker directly, whoever used it would need to hold the admin
 * token in their browser — which means you'd have to hand that token to your
 * partner, and a token in a browser is a token in a screenshot eventually.
 *
 * With this proxy the token lives in a Vercel environment variable and never
 * leaves the server. The dashboard only ever knows a page password, which you
 * can change in thirty seconds from the Vercel dashboard without touching
 * anything else.
 *
 * Two environment variables, both set in Vercel (Settings → Environment
 * Variables), never in this repo:
 *
 *   ADFLOW_ADMIN_TOKEN   the licence server's admin token
 *   ADFLOW_ADMIN_PASS    the password you and your partner type into the page
 *
 * Optional:
 *   ADFLOW_API           the Worker URL, if it ever changes
 */

import crypto from "node:crypto";

const DEFAULT_API = "https://adflow-license.reodel.workers.dev";

/**
 * Constant-time compare over SHA-256 digests, so neither the length nor the
 * content of the real password can be inferred from response timing.
 */
function samePassword(given, real) {
  if (typeof given !== "string" || typeof real !== "string" || !real) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Only these shapes may be forwarded. Without this, anyone holding the page
 * password could steer the proxy at other paths on the licence server. The
 * dashboard needs exactly this list and nothing more.
 */
const ALLOWED = [
  { m: "GET",    re: /^\/admin\/stats$/ },
  { m: "GET",    re: /^\/admin\/keys(\?q=[^&]*)?$/ },
  { m: "POST",   re: /^\/admin\/keys$/ },
  { m: "GET",    re: /^\/admin\/keys\/ADF(-[A-Z0-9]{4}){4}$/ },
  { m: "POST",   re: /^\/admin\/keys\/ADF(-[A-Z0-9]{4}){4}\/(revoke|restore|extend|seats)$/ },
  { m: "POST",   re: /^\/admin\/devices\/[a-f0-9]{8,64}\/revoke$/ },
  { m: "DELETE", re: /^\/admin\/devices\/[a-f0-9]{8,64}$/ },
];

const permitted = (method, path) => ALLOWED.some((r) => r.m === method && r.re.test(path));

// A failed password costs the caller half a second. Not a real rate limiter —
// serverless has no shared state for that — but it turns an online guessing
// attack into something that would take years rather than an afternoon.
const slowDown = () => new Promise((r) => setTimeout(r, 500));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const TOKEN = process.env.ADFLOW_ADMIN_TOKEN;
  const PASS = process.env.ADFLOW_ADMIN_PASS;
  const API = (process.env.ADFLOW_API || DEFAULT_API).replace(/\/+$/, "");

  if (!TOKEN || !PASS) {
    return res.status(500).json({
      ok: false,
      message: "Hindi pa naka-set ang ADFLOW_ADMIN_TOKEN at ADFLOW_ADMIN_PASS sa Vercel.",
    });
  }

  const { pass, method = "GET", path = "", body } = req.body || {};

  if (!samePassword(pass, PASS)) {
    await slowDown();
    return res.status(401).json({ ok: false, message: "Maling password." });
  }

  if (!permitted(method, path)) {
    return res.status(400).json({ ok: false, message: "Hindi pinapayagang request." });
  }

  try {
    const upstream = await fetch(API + path, {
      method,
      headers: Object.assign(
        { authorization: "Bearer " + TOKEN },
        body ? { "content-type": "application/json" } : {}
      ),
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await upstream.text();
    // Pass the licence server's own status and JSON straight through, so the
    // dashboard keeps showing its real error messages.
    res.status(upstream.status);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    return res.send(text);
  } catch (err) {
    console.error("adflow proxy error", err);
    return res.status(502).json({ ok: false, message: "Hindi maabot ang licence server." });
  }
}
