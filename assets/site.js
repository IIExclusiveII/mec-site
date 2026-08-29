/* Shared site behaviours loaded on every page (deferred). Keep it tiny and
   defensive — nothing here should ever be able to break a page. */
(function () {
  "use strict";

  /* ── Page-view counter (privacy-friendly, no cookies) ───────────────── */
  try {
    var host = location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local")) {
      var payload = JSON.stringify({ p: location.pathname, r: document.referrer || "" });
      var url = "/.netlify/functions/track";
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    }
  } catch (e) {}

  /* ── Social links in the footer (edited in /admin) ──────────────────── */
  var SOCIAL_ICONS = {
    instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.17.05 1.97.24 2.67.5.7.28 1.3.65 1.9 1.24.58.59.95 1.19 1.23 1.9.27.7.46 1.5.5 2.66.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.04 1.17-.23 1.97-.5 2.67-.28.7-.65 1.3-1.24 1.9-.59.58-1.19.95-1.9 1.23-.7.27-1.5.46-2.66.5-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.17-.04-1.97-.23-2.67-.5-.7-.28-1.3-.65-1.9-1.24-.58-.59-.95-1.19-1.23-1.9-.27-.7-.46-1.5-.5-2.66C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.04-1.17.23-1.97.5-2.67.28-.7.65-1.3 1.24-1.9.59-.58 1.19-.95 1.9-1.23.7-.27 1.5-.46 2.66-.5C8.4 2.2 8.8 2.2 12 2.2zm0 3.2a6.6 6.6 0 100 13.2 6.6 6.6 0 000-13.2zm0 10.9a4.3 4.3 0 110-8.6 4.3 4.3 0 010 8.6zm6.9-11.2a1.55 1.55 0 11-3.1 0 1.55 1.55 0 013.1 0z"/>',
    facebook: '<path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46H15.2c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z"/>',
    telegram: '<path d="M21.94 4.3l-3.1 14.6c-.23 1.03-.85 1.28-1.72.8l-4.75-3.5-2.29 2.2c-.25.26-.47.47-.96.47l.34-4.83 8.8-7.95c.38-.34-.08-.53-.6-.19L6.9 13.02l-4.68-1.46c-1.02-.32-1.04-1.02.21-1.51l18.3-7.05c.85-.31 1.6.2 1.32 1.3z"/>',
    viber: '<path d="M12 2C7 2 2.8 5 2.8 9.9c0 2.1.8 4 2.2 5.5-.2 1.5-.7 2.9-1.5 4.2-.2.3 0 .7.4.6 1.9-.4 3.4-1.1 4.5-1.9 1 .2 2 .4 3.1.4 5 0 9.2-3 9.2-7.9S17 2 12 2zm4.6 11.7c-.2.5-1 1-1.5 1.1-.4.1-.9.1-1.4-.1-.3-.1-.8-.3-1.4-.5-2.4-1-4-3.4-4.1-3.6-.1-.2-1-1.2-1-2.3s.6-1.6.8-1.9c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4l.7 1.6c.1.1.1.3 0 .4l-.2.3-.3.3c-.1.1-.2.3-.1.5.1.2.5.9 1.2 1.5.9.8 1.6 1 1.8 1.1.2.1.3.1.5-.1l.5-.6c.1-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.5-.1 1z"/>',
    youtube: '<path d="M23 12s0-3.2-.4-4.7c-.2-.8-.9-1.5-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4c-.8.2-1.5.9-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7c.2.8.9 1.5 1.7 1.7 1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4c.8-.2 1.5-.9 1.7-1.7.4-1.5.4-4.7.4-4.7zM9.8 15V9l5.2 3-5.2 3z"/>',
    tiktok: '<path d="M16.5 2h-3v13.2a2.7 2.7 0 11-2.7-2.7c.2 0 .5 0 .7.1V9.5a6 6 0 106 6V8.9a7 7 0 004 1.3V7a4.1 4.1 0 01-3-2 4.1 4.1 0 01-1-3z"/>',
  };
  function injectSocialCSS() {
    if (document.getElementById("social-css")) return;
    var st = document.createElement("style");
    st.id = "social-css";
    st.textContent =
      ".footer-social{display:flex;gap:14px;align-items:center;flex-wrap:wrap}" +
      ".footer-social a{color:var(--gray,#8090a0);display:inline-flex;transition:color .2s,transform .2s}" +
      ".footer-social a:hover{color:var(--gold,#e8a020);transform:translateY(-2px)}";
    document.head.appendChild(st);
  }
  function loadSocial() {
    var mounts = document.querySelectorAll("[data-social-links]");
    if (!mounts.length) return;
    injectSocialCSS();
    fetch("/content/social.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        var order = ["instagram", "facebook", "telegram", "viber", "youtube", "tiktok"];
        var links = order
          .filter(function (k) { return s[k] && String(s[k]).trim(); })
          .map(function (k) {
            var href = String(s[k]).trim();
            if (!/^https?:|^tel:|^viber:/.test(href)) href = "https://" + href;
            return (
              '<a href="' + href.replace(/"/g, "%22") + '" target="_blank" rel="noopener" aria-label="' + k + '">' +
              '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">' + (SOCIAL_ICONS[k] || "") + "</svg></a>"
            );
          })
          .join("");
        if (!links) return;
        mounts.forEach(function (m) { m.innerHTML = links; m.classList.add("has-social"); });
      })
      .catch(function () {});
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSocial);
  } else {
    loadSocial();
  }
})();
