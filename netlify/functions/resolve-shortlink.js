// Resolves a short Google Maps share link (https://maps.app.goo.gl/...) to
// {lat, lng} by following its redirect server-side (browsers can't do this
// themselves — Google's short-link redirect isn't reachable cross-origin).
exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    // Never let Netlify's CDN (or anything else) cache this by path alone —
    // a previous version cached by accident and kept returning the FIRST
    // resolved link's coordinates for every different ?url= after it.
    "Cache-Control": "no-store, no-cache, must-revalidate"
  };
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url || !/^https:\/\/maps\.app\.goo\.gl\//.test(url)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid url" }) };
  }
  try {
    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location");
    if (!location) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "no redirect found" }) };
    }
    // Try, in order of precision: the exact place pin (!3d..!4d..), the map
    // viewport center (@lat,lng), then a plain "lat,lng" pair as used by
    // Google's /maps/search/50.43,+30.11 redirect form.
    let m = location.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
    if (!m) m = location.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if (!m) m = location.match(/\/(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)(?:[?/]|$)/);
    if (!m) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "no coordinates found", resolved: location }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "resolve failed" }) };
  }
};
