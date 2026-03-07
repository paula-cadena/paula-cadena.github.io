// ============================================================
// PORTFOLIO VISITOR TRACKER  —  js/tracker.js
//
// Paste your Google Apps Script deployment URL below.
// Then add <script src="js/tracker.js"></script> to index.html
// (just before the closing </body> tag, after main.js)
// ============================================================

const CONFIG = {
  ENDPOINT: "https://script.google.com/macros/s/AKfycbw6uBOIEtTLJWQDkOVKvx0O7TDPWtzBhLOIk-dS5gj_99wLISQvm0aHyDn9JSEmOMJgoQ/exec",
};

// ------------------------------------------------------------
// Session state
// ------------------------------------------------------------
const SESSION = {
  id:         generateSessionId(),
  start:      Date.now(),
  page:       document.title,
  referrer:   document.referrer || "direct",
  ...parseUTM(),
  ...parseDevice(),
};

let sectionTimes = {};   // section → timestamp when it entered viewport
let activeSection = null;

// ------------------------------------------------------------
// Send one event to the Apps Script endpoint
// ------------------------------------------------------------
function send(event, extra = {}) {
  const payload = {
    timestamp:    new Date().toISOString(),
    event,
    session_id:   SESSION.id,
    page:         SESSION.page,
    referrer:     SESSION.referrer,
    device:       SESSION.device,
    os:           SESSION.os,
    browser:      SESSION.browser,
    screen:       SESSION.screen,
    utm_source:   SESSION.utm_source,
    utm_medium:   SESSION.utm_medium,
    utm_campaign: SESSION.utm_campaign,
    country:      null,   // filled async by geo lookup
    city:         null,
    ...extra,
  };

  // Geo enrichment — best-effort, non-blocking
  enrichGeo().then(geo => {
    payload.country = geo.country;
    payload.city    = geo.city;
    postEvent(payload);
  }).catch(() => postEvent(payload));
}

function postEvent(payload) {
  // Use sendBeacon when available (survives page unload)
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(ENDPOINT, blob);
  } else {
    fetch(ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }
}

// ------------------------------------------------------------
// GEO — free ipapi.co lookup (1,000 req/day free tier)
// ------------------------------------------------------------
let geoCache = null;
function enrichGeo() {
  if (geoCache) return Promise.resolve(geoCache);
  return fetch("https://ipapi.co/json/")
    .then(r => r.json())
    .then(d => {
      geoCache = { country: d.country_name || d.country, city: d.city };
      return geoCache;
    });
}

// ------------------------------------------------------------
// EVENTS
// ------------------------------------------------------------

// 1. Page view (on load)
window.addEventListener("load", () => {
  send("page_view");
});

// 2. Page exit — record total time on page
window.addEventListener("beforeunload", () => {
  const duration = Math.round((Date.now() - SESSION.start) / 1000);
  send("page_exit", { duration_sec: duration });
});

// 3. Section visibility — fires when each section enters viewport
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const id = entry.target.id;
    if (entry.isIntersecting) {
      sectionTimes[id] = Date.now();
      activeSection    = id;
      send("section_view", { section_visible: id });
    } else if (sectionTimes[id]) {
      const dwell = Math.round((Date.now() - sectionTimes[id]) / 1000);
      send("section_exit", { section_visible: id, duration_sec: dwell });
      delete sectionTimes[id];
    }
  });
}, { threshold: 0.4 });

document.querySelectorAll("section[id]").forEach(s => sectionObserver.observe(s));

// 4. Project link clicks
document.querySelectorAll(".project-links a, .project-card, .featured-project-card").forEach(el => {
  el.addEventListener("click", (e) => {
    // Find the closest project title
    const card  = el.closest(".project-card, .featured-project-card");
    const title = card?.querySelector(".project-title")?.textContent?.trim() || "unknown";
    const href  = el.href || el.closest("a")?.href || "";
    send("project_click", {
      project_clicked: title,
      section_visible: "projects",
      page: href,
    });
  });
});

// 5. CTA clicks (hero buttons, contact links)
document.querySelectorAll(".hero-ctas a, .contact-link, .btn-primary, .btn-outline").forEach(el => {
  el.addEventListener("click", () => {
    send("cta_click", {
      page: el.href || el.textContent.trim(),
      section_visible: activeSection,
    });
  });
});

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function generateSessionId() {
  return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

function parseUTM() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source:   p.get("utm_source")   || null,
    utm_medium:   p.get("utm_medium")   || null,
    utm_campaign: p.get("utm_campaign") || null,
  };
}

function parseDevice() {
  const ua  = navigator.userAgent;
  const w   = window.innerWidth;

  const device =
    /Mobi|Android/i.test(ua) ? "mobile" :
    /Tablet|iPad/i.test(ua)  ? "tablet" : "desktop";

  const os =
    /Windows/.test(ua) ? "Windows" :
    /Mac OS/.test(ua)  ? "macOS"   :
    /Linux/.test(ua)   ? "Linux"   :
    /Android/.test(ua) ? "Android" :
    /iOS|iPhone|iPad/.test(ua) ? "iOS" : "Other";

  const browser =
    /Edg\//.test(ua)    ? "Edge"    :
    /OPR\//.test(ua)    ? "Opera"   :
    /Chrome\//.test(ua) ? "Chrome"  :
    /Firefox\//.test(ua)? "Firefox" :
    /Safari\//.test(ua) ? "Safari"  : "Other";

  return {
    device,
    os,
    browser,
    screen: `${window.screen.width}×${window.screen.height}`,
  };
}
