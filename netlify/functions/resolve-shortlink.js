// Resolves a short Google Maps share link (https://maps.app.goo.gl/...) to
// {lat, lng} by following its redirect server-side (browsers can't do this
// themselves — Google's short-link redirect isn't reachable cross-origin).
exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=86400"
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
    // prefer the precise place coordinates (!3d..!4d..), fall back to the
    // map viewport center (@lat,lng) if that's all the URL has
    let m = location.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (!m) m = location.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!m) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "no coordinates found" }) };
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
