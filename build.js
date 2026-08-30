/* Build step run by Netlify (`npm run build`):
 *  1. renders content/blog/*.md into real /blog/<slug>.html pages + /blog.html index
 *  2. applies per-page SEO overrides from content/seo.json
 *  3. refreshes sitemap.xml with the blog URLs
 * Hand-authored .html pages are the "shell" (nav, footer, styles, scripts) —
 * blog pages reuse pro-nas.html so they always match the rest of the site.
 */
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const matter = require("gray-matter");

const ROOT = __dirname;
const SITE = "https://mecua.netlify.app";
const BLOG_DIR = path.join(ROOT, "content", "blog");
const OUT_DIR = path.join(ROOT, "blog");

const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- shell (header up to content, footer to end) ---------- */
const shellSrc = read(path.join(ROOT, "pro-nas.html"));
const SPLIT_TOP = '<section class="page-hero">';
const SPLIT_BOT = "<footer>";
const iTop = shellSrc.indexOf(SPLIT_TOP);
const iBot = shellSrc.indexOf(SPLIT_BOT);
if (iTop < 0 || iBot < 0) {
  console.error("build.js: could not locate shell split points in pro-nas.html");
  process.exit(1);
}
const SHELL_HEAD = shellSrc.slice(0, iTop);
const SHELL_FOOT = shellSrc.slice(iBot);

const POST_CSS = `
<style>
  .post-hero .container{max-width:820px}
  .post-meta{font-family:var(--font-mono);font-size:12px;color:var(--gray);letter-spacing:.06em;margin-top:14px}
  .post-cover{width:100%;max-width:820px;border:1px solid var(--gray2);border-radius:var(--radius-lg,10px);margin:0 auto 8px;display:block;object-fit:cover}
  .post-body{max-width:720px;font-size:16px;line-height:1.8;color:#c9d4de}
  .post-body h2{font-family:var(--font-display);font-size:clamp(22px,3vw,30px);color:var(--white);margin:44px 0 14px;line-height:1.2}
  .post-body h3{font-family:var(--font-display);font-size:20px;color:var(--white);margin:32px 0 10px}
  .post-body p{margin:0 0 18px}
  .post-body a{color:var(--cyan);text-decoration:underline}
  .post-body ul,.post-body ol{margin:0 0 18px;padding-left:22px}
  .post-body li{margin-bottom:8px}
  .post-body img{max-width:100%;height:auto;border-radius:8px;border:1px solid var(--gray2);margin:12px 0}
  .post-body blockquote{border-left:3px solid var(--gold);margin:20px 0;padding:4px 0 4px 18px;color:var(--gray)}
  .post-body code{background:var(--bg3);border:1px solid var(--gray2);border-radius:4px;padding:1px 6px;font-size:14px}
  .blog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;margin-top:12px}
  .blog-card{display:flex;flex-direction:column;border:1px solid var(--gray2);border-radius:var(--radius-lg,10px);overflow:hidden;background:var(--bg2);transition:border-color .2s,transform .2s;text-decoration:none;color:inherit}
  .blog-card:hover{border-color:var(--gold);transform:translateY(-3px)}
  .blog-card-img{aspect-ratio:16/10;object-fit:cover;width:100%;background:var(--bg3)}
  .blog-card-body{padding:18px 20px 22px;display:flex;flex-direction:column;gap:8px;flex:1}
  .blog-card-date{font-family:var(--font-mono);font-size:11px;color:var(--gray);letter-spacing:.06em}
  .blog-card h2{font-family:var(--font-display);font-size:19px;line-height:1.25;color:var(--white);margin:0}
  .blog-card p{font-size:14px;color:var(--gray);margin:0;line-height:1.6}
  .blog-empty{color:var(--gray);font-size:15px;margin-top:20px}
</style>
`;

/* patch <head> tags of the shell for a given page */
function patchHead(head, { title, description, url, image, extraCss, jsonld }) {
  let h = head;
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  const setMeta = (attr, val) => {
    const re = new RegExp(`(<meta\\s+${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+content=")[^"]*(")`, "i");
    if (re.test(h)) h = h.replace(re, `$1${esc(val)}$2`);
  };
  if (description) {
    setMeta('name="description"', description);
    setMeta('property="og:description"', description);
    setMeta('name="twitter:description"', description);
  }
  setMeta('property="og:title"', title);
  setMeta('name="twitter:title"', title);
  if (url) {
    setMeta('property="og:url"', url);
    h = h.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${esc(url)}$2`);
  }
  if (image) {
    setMeta('property="og:image"', image);
    setMeta('name="twitter:image"', image);
  }
  // drop the shell page's own structured data, add ours
  h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, "");
  h = h.replace(/<\/head>/i, `${extraCss || ""}${jsonld ? `<script type="application/ld+json">${jsonld}</script>\n` : ""}</head>`);
  // remove "active" nav highlight inherited from pro-nas
  h = h.replace(/(<a[^>]*href="\/pro-nas"[^>]*)\sclass="active"/g, "$1");
  h = h.replace(/(<a[^>]*href="\/pro-nas"[^>]*class="[^"]*)\sactive/g, "$1");
  h = h.replace(/(<a[^>]*href="\/pro-nas"[^>]*class="mm-link) active(")/g, "$1$2");
  return h;
}

function readingTime(text) {
  const words = (text.trim().match(/\S+/g) || []).length;
  return Math.max(1, Math.round(words / 180)) + " хв читання";
}
function fmtDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return dt.toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });
}

/* ---------- blog ---------- */
function loadPosts() {
  if (!exists(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const parsed = matter(read(path.join(BLOG_DIR, f)));
      const slug = f.replace(/\.md$/, "");
      return {
        slug,
        url: `${SITE}/blog/${slug}`,
        path: `/blog/${slug}`,
        title: parsed.data.title || slug,
        date: parsed.data.date || "",
        description: parsed.data.description || "",
        cover: parsed.data.cover || "",
        draft: !!parsed.data.draft,
        bodyMd: parsed.content || parsed.data.body || "",
      };
    })
    .filter((p) => !p.draft)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderPost(p) {
  const bodyHtml = marked.parse(p.bodyMd);
  const jsonld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    datePublished: p.date ? new Date(p.date).toISOString() : undefined,
    description: p.description || undefined,
    image: p.cover ? SITE + p.cover : undefined,
    author: { "@type": "Organization", name: "ТОВ МОНТАЖЕНЕРГОСИСТЕМ" },
    publisher: { "@type": "Organization", name: "МЕС", logo: { "@type": "ImageObject", url: SITE + "/icon-512.png" } },
    mainEntityOfPage: p.url,
  });
  const head = patchHead(SHELL_HEAD, {
    title: `${p.title} — Блог МЕС`,
    description: p.description,
    url: p.url,
    image: p.cover ? SITE + p.cover : SITE + "/og-image.png",
    extraCss: POST_CSS,
    jsonld,
  });
  const content = `<section class="page-hero post-hero">
  <div class="container">
    <div class="breadcrumb"><a href="/">Головна</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg><a href="/blog">Блог</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg><span>${esc(p.title)}</span></div>
    <div class="section-label">Стаття</div>
    <h1 class="section-title" style="font-size:clamp(26px,4vw,44px)">${esc(p.title)}</h1>
    <div class="post-meta">${esc(fmtDate(p.date))}${p.date ? " · " : ""}${esc(readingTime(p.bodyMd))}</div>
  </div>
</section>
<section style="padding:24px 0 90px">
  <div class="container">
    ${p.cover ? `<img class="post-cover" src="${esc(p.cover)}" alt="${esc(p.title)}" loading="lazy">` : ""}
    <div class="post-body">${bodyHtml}</div>
    <p style="margin-top:48px"><a href="/blog" class="btn-outline">&#8592; Усі статті</a></p>
  </div>
</section>
`;
  return head + content + SHELL_FOOT;
}

function renderIndexList(posts) {
  if (!posts.length) return `<p class="blog-empty">Статей поки немає — скоро тут з'являться корисні матеріали про електромонтаж.</p>`;
  return `<div class="blog-grid">
${posts
  .map(
    (p) => `  <a class="blog-card" href="${esc(p.path)}">
    ${p.cover ? `<img class="blog-card-img" src="${esc(p.cover)}" alt="${esc(p.title)}" loading="lazy">` : `<div class="blog-card-img"></div>`}
    <div class="blog-card-body">
      <div class="blog-card-date">${esc(fmtDate(p.date))}</div>
      <h2>${esc(p.title)}</h2>
      <p>${esc(p.description)}</p>
    </div>
  </a>`
  )
  .join("\n")}
</div>`;
}

function renderIndex(posts) {
  const head = patchHead(SHELL_HEAD, {
    title: "Блог про електромонтаж — поради, стандарти, кейси | МЕС",
    description: "Статті ТОВ «МОНТАЖЕНЕРГОСИСТЕМ»: кабельні лінії, трансформаторні підстанції, електролабораторія, заземлення — практичні поради та розбори.",
    url: SITE + "/blog",
    image: SITE + "/og-image.png",
    extraCss: POST_CSS,
    jsonld: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Блог МЕС",
      url: SITE + "/blog",
      publisher: { "@type": "Organization", name: "МЕС" },
    }),
  });
  const content = `<section class="page-hero">
  <div class="container">
    <div class="breadcrumb"><a href="/">Головна</a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg><span>Блог</span></div>
    <div class="section-label">Блог</div>
    <h1 class="section-title">Корисне про <span class="text-gold">електромонтаж</span></h1>
  </div>
</section>
<section style="padding:8px 0 100px">
  <div class="container">
    ${renderIndexList(posts)}
  </div>
</section>
`;
  return head + content + SHELL_FOOT;
}

/* ---------- per-page SEO overrides ---------- */
function applySeo() {
  const seoPath = path.join(ROOT, "content", "seo.json");
  if (!exists(seoPath)) return 0;
  let raw;
  try { raw = JSON.parse(read(seoPath)); } catch (e) { console.warn("seo.json invalid — skipped"); return 0; }
  const src = (raw && raw.pages) || raw || {};
  const KEY_TO_FILE = {
    home: "index.html",
    poslugy: "poslugy.html",
    pro_nas: "pro-nas.html",
    galereya: "galereya.html",
    kontakty: "kontakty.html",
    faq: "faq-elektromontazh-kyiv.html",
  };
  const map = {};
  for (const [k, v] of Object.entries(src)) map[KEY_TO_FILE[k] || k] = v;
  let n = 0;
  for (const [file, o] of Object.entries(map)) {
    const fp = path.join(ROOT, file);
    if (!/^[\w-]+\.html$/.test(file) || !exists(fp)) continue;
    let html = read(fp);
    const before = html;
    if (o && o.title) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(o.title)}</title>`);
    const set = (attr, val) => {
      if (!val) return;
      const re = new RegExp(`(<meta\\s+${attr}\\s+content=")[^"]*(")`, "i");
      if (re.test(html)) html = html.replace(re, `$1${esc(val)}$2`);
    };
    if (o) {
      set('name="description"', o.description);
      set('property="og:description"', o.description);
      set('name="twitter:description"', o.description);
      set('property="og:title"', o.title);
      set('name="twitter:title"', o.title);
      set('property="og:image"', o.ogImage);
      set('name="twitter:image"', o.ogImage);
    }
    if (html !== before) { fs.writeFileSync(fp, html); n++; }
  }
  return n;
}

/* ---------- sitemap ---------- */
function updateSitemap(posts) {
  const sp = path.join(ROOT, "sitemap.xml");
  if (!exists(sp)) return;
  let xml = read(sp).replace(/\s*<url>\s*<loc>[^<]*\/blog[^<]*<\/loc>[\s\S]*?<\/url>/g, "");
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    `  <url><loc>${SITE}/blog</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    ...posts.map(
      (p) => `  <url><loc>${p.url}</loc><lastmod>${(p.date && new Date(p.date).toISOString().slice(0, 10)) || today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`
    ),
  ].join("\n");
  xml = xml.replace(/<\/urlset>/, `${entries}\n</urlset>`);
  fs.writeFileSync(sp, xml);
}

/* ---------- run ---------- */
const posts = loadPosts();
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const p of posts) fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), renderPost(p));
fs.writeFileSync(path.join(ROOT, "blog.html"), renderIndex(posts));
const seoN = applySeo();
updateSitemap(posts);
console.log(`build.js: ${posts.length} blog post(s), blog.html, ${seoN} page(s) SEO-patched, sitemap updated`);
