// Privacy-friendly page-view counter. No cookies, no IPs, no per-visitor
// tracking — just aggregated daily counts kept in Netlify Blobs.
// Referrers are stored as short ASCII tokens; the dashboard localises them.
const H = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

function refToken(r, host) {
  if (!r) return "direct";
  try {
    const h = new URL(r).hostname.replace(/^www\./, "");
    if (h === String(host || "").replace(/^www\./, "")) return "direct";
    if (/(^|\.)google\./.test(h)) return "google";
    if (/(^|\.)bing\./.test(h)) return "bing";
    if (/duckduckgo/.test(h)) return "duckduckgo";
    if (/facebook|fb\.com|fb\.me/.test(h)) return "facebook";
    if (/instagram/.test(h)) return "instagram";
    if (/t\.me|telegram/.test(h)) return "telegram";
    if (/olx\./.test(h)) return "olx";
    return h.slice(0, 60);
  } catch (e) {
    return "other";
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: H, body: "" };

  const ua = (event.headers["user-agent"] || "").toLowerCase();
  if (/bot|crawl|spider|slurp|preview|facebookexternal|headless|lighthouse|monitor|pingdom|curl|wget|python-requests/.test(ua)) {
    return { statusCode: 204, headers: H, body: "" };
  }

  let raw = event.body || "{}";
  if (event.isBase64Encoded) {
    try { raw = Buffer.from(raw, "base64").toString("utf8"); } catch (e) {}
  }
  let body = {};
  try { body = JSON.parse(raw); } catch (e) {}

  let path = String(body.p || "/").split("?")[0].split("#")[0].slice(0, 120) || "/";
  if (!path.startsWith("/")) path = "/" + path;
  const ref = refToken(body.r, event.headers.host);
  const day = new Date().toISOString().slice(0, 10);

  try {
    const { connectLambda, getStore } = await import("@netlify/blobs");
    connectLambda(event);
    const store = getStore("analytics");
    const key = "day/" + day;
    const cur = (await store.get(key, { type: "json" })) || { total: 0, pages: {}, refs: {} };
    cur.total = (cur.total || 0) + 1;
    cur.pages[path] = (cur.pages[path] || 0) + 1;
    cur.refs[ref] = (cur.refs[ref] || 0) + 1;
    await store.setJSON(key, cur);
  } catch (e) {
    // Never let analytics break anything — just drop the hit.
  }
  return { statusCode: 204, headers: H, body: "" };
};
