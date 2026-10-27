/* Amplitude 사용 통계. 공개용 API Key만 사용합니다(Secret Key는 절대 넣지 않음).
   수집 거부: 주소 뒤에 ?notrack=1 을 붙이면 이 브라우저에서는 전송하지 않습니다(?notrack=0 으로 해제). */
(function () {
  "use strict";
  var API_KEY = "8efbf8caa22195129e76abdb618d9915";
  var SDK = "https://cdn.jsdelivr.net/npm/@amplitude/analytics-browser@2.11.1/lib/scripts/amplitude-min.umd.js";

  try {
    var q = new URLSearchParams(location.search).get("notrack");
    if (q === "1") localStorage.setItem("vb-notrack", "1");
    if (q === "0") localStorage.removeItem("vb-notrack");
    if (localStorage.getItem("vb-notrack") === "1") return;
  } catch (e) {}
  if (navigator.doNotTrack === "1") return;

  var path = decodeURIComponent(location.pathname);
  var page = /6인제/.test(path) ? "six" : /9인제/.test(path) ? "nine" : "index";
  var source = location.protocol === "file:" ? "file" : /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? "local" : "web";
  var base = { page: page, source: source };

  var queue = [], ready = false;
  function track(name, props) {
    var p = Object.assign({}, base, props || {});
    if (ready) window.amplitude.track(name, p); else queue.push([name, p]);
  }
  window.vbTrack = track;

  var s = document.createElement("script");
  s.src = SDK; s.async = true;
  s.onload = function () {
    window.amplitude.init(API_KEY, undefined, {
      autocapture: { sessions: true, pageViews: false, fileDownloads: false, formInteractions: false, elementInteractions: false }
    });
    ready = true;
    queue.splice(0).forEach(function (e) { window.amplitude.track(e[0], e[1]); });
  };
  document.head.appendChild(s);

  var ss = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  var COUNT_KEYS = { six: "volleyball-recorder/v1", nine: "volleyball-recorder-9/v1" };
  function eventCount() {
    try { var m = JSON.parse(localStorage.getItem(COUNT_KEYS[page])); return m && m.match && m.match.events ? m.match.events.length : 0; } catch (e) { return 0; }
  }

  /* 페이지 진입 */
  var t0 = Date.now(), active = 0, lastShown = document.visibilityState === "visible" ? Date.now() : 0, maxScroll = 0;
  var startCount = COUNT_KEYS[page] ? eventCount() : null;
  track("page_viewed", { referrer: document.referrer ? new URL(document.referrer).hostname : "", title: document.title, events_at_start: startCount });

  /* 체류 시간(탭이 보이는 시간만 합산) + 스크롤 깊이 */
  function pauseClock() { if (lastShown) { active += Date.now() - lastShown; lastShown = 0; } }
  window.addEventListener("scroll", function () {
    var h = document.documentElement.scrollHeight - innerHeight;
    if (h > 0) maxScroll = Math.max(maxScroll, Math.round(scrollY / h * 100));
  }, { passive: true });

  var sent = false;
  function exit() {
    if (sent) return; sent = true;
    pauseClock();
    var props = { active_seconds: Math.round(active / 1000), total_seconds: Math.round((Date.now() - t0) / 1000), max_scroll_pct: maxScroll };
    if (COUNT_KEYS[page]) { var n = eventCount(); props.events_at_end = n; props.events_added = n - startCount; }
    try { if (ready) window.amplitude.setTransport("beacon"); } catch (e) {}
    track("page_exit", props);
    try { if (ready) window.amplitude.flush(); } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { pauseClock(); exit(); sent = false; }
    else lastShown = Date.now();
  });
  window.addEventListener("pagehide", exit);

  /* 클릭: 버튼·링크가 무엇인지(텍스트 30자까지). 입력창에 쓴 내용은 수집하지 않음 */
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest && ev.target.closest("a,button,[role=button],summary");
    if (!el) return;
    var label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30);
    track("ui_clicked", { label: label, tag: el.tagName.toLowerCase(), id: el.id || "" });

    /* index 전용 의미 있는 이벤트 */
    if (page !== "index") return;
    var tile = el.closest(".t");
    if (!tile) return;
    if (tile.classList.contains("six") || tile.classList.contains("nine")) {
      var mode = tile.classList.contains("six") ? 6 : 9;
      var n = (+ss.get("vb-mode-clicks") || 0) + 1;
      ss.set("vb-mode-clicks", n);
      if (n === 1) ss.set("vb-first-mode", mode);
      track("mode_selected", {
        mode: mode, click_index: n, first_mode_in_session: +ss.get("vb-first-mode"),
        seconds_since_arrival: Math.round((Date.now() - t0) / 1000), has_saved_game: !!tile.querySelector(".resume:not([hidden])")
      });
    } else if (tile.classList.contains("guide")) {
      track("guide_pdf_opened", { seconds_since_arrival: Math.round((Date.now() - t0) / 1000) });
    } else if (tile.classList.contains("video")) {
      track("guide_video_opened", { seconds_since_arrival: Math.round((Date.now() - t0) / 1000) });
    }
  }, true);

  /* 가이드 영상 시청 */
  var v = document.getElementById("vplayer");
  if (v) {
    var watched = 0, lastT = null, maxPos = 0, marks = {}, closed = true;
    v.addEventListener("play", function () { closed = false; lastT = v.currentTime; track("guide_video_play", { position: Math.round(v.currentTime) }); });
    v.addEventListener("timeupdate", function () {
      if (lastT !== null && !v.paused) { var d = v.currentTime - lastT; if (d > 0 && d < 2) watched += d; }
      lastT = v.currentTime; maxPos = Math.max(maxPos, v.currentTime);
      if (v.duration) [25, 50, 75].forEach(function (m) {
        if (!marks[m] && v.currentTime / v.duration * 100 >= m) { marks[m] = 1; track("guide_video_progress", { percent: m, watched_seconds: Math.round(watched) }); }
      });
    });
    v.addEventListener("pause", function () { lastT = null; });
    v.addEventListener("ended", function () { track("guide_video_progress", { percent: 100, watched_seconds: Math.round(watched) }); });
    function videoDone(reason) {
      if (closed) return; closed = true;
      track("guide_video_closed", {
        reason: reason, watched_seconds: Math.round(watched), max_position: Math.round(maxPos),
        duration: Math.round(v.duration || 0), completed_pct: v.duration ? Math.round(maxPos / v.duration * 100) : 0
      });
      watched = 0; lastT = null; maxPos = 0; marks = {};
    }
    document.getElementById("vclose").addEventListener("click", function () { videoDone("button"); });
    document.getElementById("vmodal").addEventListener("click", function (e) { if (e.target.id === "vmodal") videoDone("backdrop"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") videoDone("esc"); });
    window.addEventListener("pagehide", function () { videoDone("leave"); });
  }
})();
