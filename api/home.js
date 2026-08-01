/**
 * AdFlow Licences — permanent loader.
 * -----------------------------------------------------------------------------
 * Vercel serves this for the site root ("/") because of the rewrite in
 * vercel.json. It fetches the real static index.html and injects one line —
 *   <script src="/adflow-sidebar.js"></script>
 * — before </body>, on every page load.
 *
 * Why: Del regenerates index.html often, and any line added directly to it gets
 * wiped on the next upload. This injects the line at request time instead, so
 * index.html never needs to carry it. Regenerate index.html freely — AdFlow
 * always loads.
 *
 * Fail-safe: on ANY problem, the browser is sent to the raw /index.html, so the
 * homepage can never break because of this function — it would only, in the
 * worst case, miss the AdFlow sidebar item.
 */
const TAG = '<script src="/adflow-sidebar.js"></script>';

export default async function handler(req, res) {
  const host = req.headers.host;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  try {
    const r = await fetch(proto + "://" + host + "/index.html", { redirect: "follow" });
    if (!r.ok) throw new Error("index.html " + r.status);
    let html = await r.text();
    if (!html.includes("adflow-sidebar.js")) {
      html = html.includes("</body>")
        ? html.replace("</body>", TAG + "\n</body>")
        : html + "\n" + TAG;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    return res.status(200).send(html);
  } catch (e) {
    // Never break the homepage — fall back to the untouched static file.
    res.setHeader("location", "/index.html");
    return res.status(307).end();
  }
}
