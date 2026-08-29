// Reads aggregated page-view counts for the /admin/stats.html dashboard.
const H = { "Content-Type": "application/json", "Cache-Control": "no-store" };

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const days = Math.min(Math.max(parseInt(q.days || "30", 10) || 30, 1), 90);

  const out = { range: days, total: 0, days: [], pages: {}, refs: {} };
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("analytics");
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const rec = (await store.get("day/" + key, { type: "json" })) || { total: 0, pages: {}, refs: {} };
      out.days.push({ date: key, total: rec.total || 0 });
      out.total += rec.total || 0;
      for (const [k, v] of Object.entries(rec.pages || {})) out.pages[k] = (out.pages[k] || 0) + v;
      for (const [k, v] of Object.entries(rec.refs || {})) out.refs[k] = (out.refs[k] || 0) + v;
    }
  } catch (e) {
    return { statusCode: 200, headers: H, body: JSON.stringify({ ...out, error: String((e && e.message) || e) }) };
  }

  out.topPages = Object.entries(out.pages).sort((a, b) => b[1] - a[1]).slice(0, 20);
  out.topRefs = Object.entries(out.refs).sort((a, b) => b[1] - a[1]).slice(0, 12);
  delete out.pages;
  delete out.refs;
  return { statusCode: 200, headers: H, body: JSON.stringify(out) };
};
