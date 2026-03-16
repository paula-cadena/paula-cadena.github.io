// ============================================================
// PORTFOLIO VISITOR TRACKER
// ============================================================

const ENDPOINT = "https://script.google.com/macros/s/AKfycbw6uBOIEtTLJWQDkOVKvx0O7TDPWtzBhLOIk-dS5gj_99wLISQvm0aHyDn9JSEmOMJgoQ/exec";


// ------------------------------------------------------------
// Session state 
// ------------------------------------------------------------
const SESSION = {
  id:           generateSessionId(),
  start:        Date.now(),
  page:         document.title,
  referrer:     document.referrer || "direct",
  device:       getDevice(),
  os:           getOS(),
  browser:      getBrowser(),
  screen:       window.screen.width + "x" + window.screen.height,
  utm_source:   getParam("utm_source"),
  utm_medium:   getParam("utm_medium"),
  utm_campaign: getParam("utm_campaign"),
};

let sectionTimes = {};
let activeSection = null;

// ------------------------------------------------------------
// Geo — Cloudflare trace endpoint, CORS-friendly, no API key
// ------------------------------------------------------------
let geoCache = null;
function getGeo() {
  if (geoCache) return Promise.resolve(geoCache);
  return fetch("https://cloudflare.com/cdn-cgi/trace")
    .then(function(r) { return r.text(); })
    .then(function(text) {
      const lines = {};
      text.split("\n").forEach(function(line) {
        const parts = line.split("=");
        if (parts.length === 2) lines[parts[0]] = parts[1].trim();
      });
      geoCache = { country: lines["loc"] || null, city: null };
      return geoCache;
    })
    .catch(function() { return { country: null, city: null }; });
}

// ------------------------------------------------------------
// Core: build payload and POST to Apps Script
// ------------------------------------------------------------
function send(event, extra) {
  if (ENDPOINT.startsWith("PASTE")) return;
 
  var base = Object.assign({
    timestamp:       new Date().toISOString(),
    event:           event,
    session_id:      SESSION.id,
    page:            SESSION.page,
    referrer:        SESSION.referrer,
    device:          SESSION.device,
    os:              SESSION.os,
    browser:         SESSION.browser,
    screen:          SESSION.screen,
    utm_source:      SESSION.utm_source,
    utm_medium:      SESSION.utm_medium,
    utm_campaign:    SESSION.utm_campaign,
    duration_sec:    null,
    project_clicked: null,
    section_visible: null,
  }, extra || {});
 
  getGeo().then(function(geo) {
    base.country = geo.country;
    base.city    = geo.city;
    postEvent(JSON.stringify(base));
  });
}
 
function postEvent(body) {
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
  } else {
    fetch(ENDPOINT, { method: "POST", mode: "no-cors", body: body }).catch(function() {});
  }
}
 
 
 
window.addEventListener("load", function() {
  send("page_view");
});
 
window.addEventListener("beforeunload", function() {
  send("page_exit", {
    duration_sec: Math.round((Date.now() - SESSION.start) / 1000)
  });
});
 
var sectionObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    var id = entry.target.id;
    if (entry.isIntersecting) {
      sectionTimes[id] = Date.now();
      activeSection = id;
      send("section_view", { section_visible: id });
    } else if (sectionTimes[id]) {
      send("section_exit", {
        section_visible: id,
        duration_sec: Math.round((Date.now() - sectionTimes[id]) / 1000)
      });
      delete sectionTimes[id];
    }
  });
}, { threshold: 0.4 });
 
document.querySelectorAll("section[id]").forEach(function(s) {
  sectionObserver.observe(s);
});
 
document.querySelectorAll(".project-links a").forEach(function(el) {
  el.addEventListener("click", function() {
    var card  = el.closest(".project-card, .featured-project-card");
    var title = card && card.querySelector(".project-title")
                ? card.querySelector(".project-title").textContent.trim()
                : "unknown";
    send("project_click", { project_clicked: title, section_visible: "projects" });
  });
});
 
document.querySelectorAll(".hero-ctas a, .contact-link").forEach(function(el) {
  el.addEventListener("click", function() {
    send("cta_click", { page: el.textContent.trim(), section_visible: activeSection });
  });
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function generateSessionId() {
  return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || null;
}
function getDevice() {
  var ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua))  return "tablet";
  return "desktop";
}
function getOS() {
  var ua = navigator.userAgent;
  if (/Windows/.test(ua))         return "Windows";
  if (/Mac OS/.test(ua))          return "macOS";
  if (/Android/.test(ua))         return "Android";
  if (/iOS|iPhone|iPad/.test(ua)) return "iOS";
  if (/Linux/.test(ua))           return "Linux";
  return "Other";
}
function getBrowser() {
  var ua = navigator.userAgent;
  if (/Edg\//.test(ua))     return "Edge";
  if (/OPR\//.test(ua))     return "Opera";
  if (/Chrome\//.test(ua))  return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua))  return "Safari";
  return "Other";
}