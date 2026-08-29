// Privacy-friendly page-view counter. No cookies, no IPs, no per-visitor
// tracking — just aggregated daily counts kept in Netlify Blobs.
const H = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

function refBucket(r, host) {
  if (!r) return "Прямі заходи";
  try {
    const h = new URL(r).hostname.replace(/^www\./, "");
    if (h === String(host || "").replace(/^www\./, "")) return "Прямі заходи";
    if (/(^|\.)google\./.test(h)) return "Google";
    if (/(^|\.)bing\./.test(h)) return "Bing";
    if (/duckduckgo/.test(h)) return "DuckDuckGo";
    if (/facebook|fb\.com|fb\.me/.test(h)) return "Facebook";
    if (/instagram/.test(h)) return "Instagram";
    if (/t\.me|telegram/.test(h)) return "Telegram";
    if (/olx\./.test(h)) return "OLX";
    return h;
  } catch (e) {
    return "Інше";
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: H, body: "" };

  const ua = (event.headers["user-agent"] || "").toLowerCase();
  if (/bot|crawl|spider|slurp|preview|facebookexternal|headless|lighthouse|monitor|pingdom|curl|wget|python-requests/.test(ua)) {
    return { statusCode: 204, headers: H, body: "" };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}

  let path = String(body.p || "/").split("?")[0].split("#")[0].slice(0, 120) || "/";
  if (!path.startsWith("/")) path = "/" + path;
  const ref = refBucket(body.r, event.headers.host);
  const day = new Date().toISOString().slice(0, 10);

  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: "analytics", consistency: "strong" });
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
