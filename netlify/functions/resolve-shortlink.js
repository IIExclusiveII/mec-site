// Resolves a "location" value from the works-map CMS to { lat, lng }:
//  - a Google Maps share link (maps.app.goo.gl/…, goo.gl/maps/…, full google.com/maps URL),
//    by following its redirect chain server-side (browsers can't, cross-origin);
//  - a plain street address, by geocoding it with OpenStreetMap Nominatim.
const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  // Never let Netlify's CDN cache this by path alone — a previous version did and
  // kept returning the FIRST resolved link's coordinates for every ?url= after it.
  "Cache-Control": "no-store, no-cache, must-revalidate"
};
const UA = "MEC-works-map/1.0 (+https://mecua.netlify.app)";
// Ukraine bounding box — reject any geocode result that lands outside it.
const UA_BOX = { minLat: 44.0, maxLat: 52.5, minLng: 22.0, maxLng: 40.5 };
const inUkraine = (r) => r && r.lat >= UA_BOX.minLat && r.lat <= UA_BOX.maxLat &&
                              r.lng >= UA_BOX.minLng && r.lng <= UA_BOX.maxLng;

function coordsFromMapsUrl(s) {
  if (!s) return null;
  let m = s.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);          // exact place pin
  if (!m) m = s.match(/[@/](-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/);     // @lat,lng or /lat,lng
  if (!m) m = s.match(/[?&](?:q|ll|center|destination|daddr)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

async function followRedirects(startUrl, max = 5) {
  let url = startUrl;
  for (let i = 0; i < max; i++) {
    const hit = coordsFromMapsUrl(safeDecode(url));
    if (hit) return hit;
    let res;
    try {
      res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA } });
    } catch (e) { return null; }
    const loc = res.headers.get("location");
    if (!loc) {
      const body = await res.text().catch(() => "");
      return coordsFromMapsUrl(safeDecode(url)) || coordsFromMapsUrl(body);
    }
    // Google sometimes bounces through a consent page: …/consent?continue=<encoded real url>
    const cont = loc.match(/[?&]continue=([^&]+)/);
    try { url = cont ? decodeURIComponent(cont[1]) : new URL(loc, url).href; }
    catch (e) { url = cont ? cont[1] : loc; }
  }
  return coordsFromMapsUrl(safeDecode(url));
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

async function nominatim(params) {
  const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1" +
            "&accept-language=uk&countrycodes=ua&" + params;
  try {
    const res = await fetch(u, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    if (Array.isArray(d) && d[0]) {
      const r = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      if (isFinite(r.lat) && isFinite(r.lng)) return r;
    }
  } catch (e) {}
  return null;
}

// A structured query ("street" + "city") is far more accurate than a raw string.
// We treat the last comma-separated chunk as the settlement and everything before
// it as the street/building, then fall back to a plain search.
async function geocode(address) {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  const attempts = [];
  if (parts.length >= 2) {
    const street = parts.slice(0, -1).join(", ");
    const city = parts[parts.length - 1].replace(/^(м\.?|місто|с\.?|село|смт)\s+/i, "");
    attempts.push(`street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}`);
  }
  attempts.push(`q=${encodeURIComponent(address)}`);
  for (const p of attempts) {
    const r = await nominatim(p);
    if (inUkraine(r)) return r;
    await new Promise((s) => setTimeout(s, 250));
  }
  return null;
}

exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  const url = (p.url || "").trim();
  const address = (p.address || "").trim();

  let result = null;
  if (/^https?:\/\//i.test(url)) {
    result = coordsFromMapsUrl(url) || await followRedirects(url);
  }
  if (!result && address) result = await geocode(address);
  if (!result && url && !/^https?:\/\//i.test(url)) result = await geocode(url);

  if (!result) {
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ error: "not resolved" }) };
  }
  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(result) };
};
