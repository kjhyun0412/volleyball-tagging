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
  window.addEventListener("pagehide", function () { closeOpenSources("leave"); exit(); });

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

  /* 카메라·유튜브 작동 확인: 연결 성공/실패, 사용 시간, 앱이 띄운 오류 종류만 기록합니다.
     유튜브 링크·영상 ID·카메라 기기 이름·선수/팀 이름은 보내지 않습니다. */
  var camEnd = null, ytOn = false, ytT = 0;
  function secondsSince(t) { return Math.round((Date.now() - t) / 1000); }
  function closeOpenSources(reason) {
    if (camEnd) camEnd(reason);
    if (ytOn) { ytOn = false; track("video_source_closed", { source: "youtube", seconds: secondsSince(ytT), reason: reason }); }
  }

  /* 자바스크립트 오류(다른 사람 환경에서만 터지는 문제 찾기). 따옴표 안 내용은 지워서 저장된 이름 등이 섞이지 않게 함 */
  var jsErrCount = 0;
  function clean(s) { return String(s || "").replace(/(["'`]).*?\1/g, "$1…$1").slice(0, 100); }
  window.addEventListener("error", function (ev) {
    if (jsErrCount++ >= 5) return;
    track("js_error", { message: clean(ev.message), file: String(ev.filename || "").split("?")[0].split("/").pop().slice(0, 40), line: ev.lineno || 0 });
  });
  window.addEventListener("unhandledrejection", function (ev) {
    if (jsErrCount++ >= 5) return;
    var r = ev.reason;
    track("js_error", { message: clean((r && r.name ? r.name + ": " : "") + (r && r.message ? r.message : r)), file: "promise", line: 0 });
  });

  if (page !== "index") {
    /* 카메라: 권한 요청(permission)과 선택한 카메라 연결(connect)을 나눠 성공/실패 기록 */
    try {
      var md = navigator.mediaDevices;
      if (md && md.getUserMedia) {
        var origGum = md.getUserMedia.bind(md);
        md.getUserMedia = function (c) {
          var v = c && c.video, stage = v && v.deviceId ? "connect" : "permission", t1 = Date.now();
          return origGum(c).then(function (stream) {
            track("camera_connect_result", { stage: stage, result: "success", elapsed_ms: Date.now() - t1 });
            if (stage === "connect") watchCamera(stream);
            return stream;
          }, function (e) {
            track("camera_connect_result", { stage: stage, result: "error", error_name: (e && e.name) || "unknown", elapsed_ms: Date.now() - t1 });
            throw e;
          });
        };
      }
    } catch (e) {}

    function watchCamera(stream) {
      var t = Date.now(), done = false;
      function end(reason) {
        if (done) return; done = true; camEnd = null;
        track("video_source_closed", { source: "camera", seconds: secondsSince(t), reason: reason });
      }
      camEnd = end;
      track("video_source_opened", { source: "camera" });
      stream.getVideoTracks().forEach(function (tr) {
        tr.addEventListener("ended", function () { end("disconnected"); });
        var stop = tr.stop;
        tr.stop = function () { end("closed"); return stop.apply(tr, arguments); };
      });
    }

    /* 앱이 화면에 띄운 오류 문구를 종류로만 바꿔 기록(문구 원문은 보내지 않음). 위에서부터 먼저 맞는 항목 적용 */
    var ERR = [
      ["이 주소에서는 카메라", "camera_unsupported_address", "camera"],
      ["권한이 거부", "camera_permission_denied", "camera"],
      ["윈도우 카메라 앱", "camera_in_use", "camera"],
      ["카메라를 찾지", "camera_not_found", "camera"],
      ["카메라 목록이 비어", "camera_list_empty", "camera"],
      ["카메라 연결이 끊겼", "camera_disconnected", "camera"],
      ["카메라 오류", "camera_other_error", "camera"],
      ["링크를 확인", "youtube_bad_link", "youtube"],
      ["영상 ID가", "youtube_bad_id", "youtube"],
      ["비공개", "youtube_unavailable", "youtube"],
      ["재생할 수 없는", "youtube_not_playable", "youtube"],
      ["플레이어를 불러오지", "youtube_load_failed", "youtube"],
      ["유튜브가 거부", "youtube_file_protocol", "youtube"],
      ["유튜브", "youtube_other_error", "youtube"],
      ["되감기", "replay_hint", "recording"],
      ["녹화본이 없", "replay_hint", "recording"],
      ["녹화", "recording_error", "recording"]
    ];
    function classifyErr(txt) {
      for (var i = 0; i < ERR.length; i++) if (txt.indexOf(ERR[i][0]) !== -1) return ERR[i];
      return [0, "other", "other"];
    }

    /* 화면 변화를 감시해 유튜브 열림/닫힘과 오류 문구 표시를 잡음 */
    var lastErr = "", scanTimer = null;
    function scan() {
      var on = !!document.querySelector(".vb-yt.on");
      if (on && !ytOn) { ytOn = true; ytT = Date.now(); track("video_source_opened", { source: "youtube" }); }
      else if (!on && ytOn) { ytOn = false; track("video_source_closed", { source: "youtube", seconds: secondsSince(ytT), reason: "closed" }); }
      var el = document.querySelector(".vb-err"), txt = el ? (el.textContent || "").trim() : "";
      if (txt && txt !== lastErr) { var c = classifyErr(txt); track("app_error_shown", { error_type: c[1], kind: c[2] }); }
      lastErr = txt;
    }
    new MutationObserver(function () {
      if (scanTimer) return;
      scanTimer = setTimeout(function () { scanTimer = null; scan(); }, 300);
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  }
})();
