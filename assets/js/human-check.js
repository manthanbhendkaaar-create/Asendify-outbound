// "You're a real person" check for call booking (added 2026-10-20, Manthan: "let AIs pay but don't let them book a call").
// A press-and-hold button. Every step is timed and signed by the server (Supabase function "human-gate"), which also
// checks the honeypot and the minimum time on the form, and only then saves the form and returns the calendar.
// Usage: var hc = HumanCheck.mount(element, "asendify"); ... hc.submit({ form: {...}, hp: "" }).then(function (r) { r.ok, r.cal });
(function () {
  if (window.HumanCheck) return;
  var FN = "https://pnokotvssodslxozepxe.supabase.co/functions/v1/human-gate";
  var HOLD_MS = 1500, GAP_MS = 1100;
  function post(b) {
    return fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().catch(function () { return { error: "Something went wrong. Please try again." }; }); })
      .catch(function () { return { error: "Network error. Please check your connection and try again.", network: true }; });
  }
  var css = ".hc{margin:6px 0 14px;user-select:none;-webkit-user-select:none}" +
    ".hc-btn{position:relative;overflow:hidden;width:100%;max-width:420px;padding:13px 16px;border-radius:12px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;touch-action:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;text-align:center}" +
    ".hc-btn .hc-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:currentColor;opacity:.18;pointer-events:none}" +
    ".hc-btn .hc-t{position:relative;pointer-events:none}" +
    ".hc-btn[disabled]{cursor:default;opacity:1}.hc.ok .hc-btn{border-color:#16a34a;color:#16a34a}" +
    ".hc-m{font-size:13px;margin-top:6px;min-height:1em;opacity:.85}";
  function mount(el, brand) {
    if (!document.getElementById("hc-css")) { var s = document.createElement("style"); s.id = "hc-css"; s.textContent = css; document.head.appendChild(s); }
    el.classList.add("hc");
    el.innerHTML = '<button type="button" class="hc-btn" aria-describedby="hcm-' + brand + '"><span class="hc-fill"></span><span class="hc-t">Press and hold to confirm you\'re a person</span></button><div class="hc-m" id="hcm-' + brand + '" aria-live="polite"></div>';
    var btn = el.querySelector(".hc-btn"), fill = el.querySelector(".hc-fill"), label = el.querySelector(".hc-t"), msg = el.querySelector(".hc-m");
    var token = null, startP = null, pass = null, holding = false, t0 = 0, raf = 0, timer = 0, hsP = null, hsAt = 0, busy = false;
    function say(t, bad) { msg.textContent = t || ""; msg.style.color = bad ? "#dc2626" : ""; }
    function start() { startP = post({ action: "start", brand: brand }).then(function (r) { if (r && r.token) token = r.token; return r; }); return startP; }
    function reset(t) {
      pass = null; holding = false; busy = false; cancelAnimationFrame(raf); clearTimeout(timer); fill.style.width = "0";
      el.classList.remove("ok"); btn.disabled = false; label.textContent = "Press and hold to confirm you're a person"; say(t || "", !!t);
      if (!token) start();
    }
    function frame() {
      if (!holding) return;
      var p = Math.min(1, (Date.now() - t0) / HOLD_MS); fill.style.width = (p * 100) + "%";
      if (p < 1) raf = requestAnimationFrame(frame);
    }
    function down(e) {
      if (pass || busy || holding) return;
      if (e && e.type === "keydown") { if (e.repeat || (e.key !== " " && e.key !== "Enter")) return; e.preventDefault(); }
      if (e && e.pointerId !== undefined) { try { btn.setPointerCapture(e.pointerId); } catch (_x) {} }
      holding = true; t0 = Date.now(); say("Keep holding…");
      var go = function () { return post({ action: "hold_start", token: token }).then(function (r) { hsAt = Date.now(); return r; }); };
      hsP = token ? go() : (startP || start()).then(function () { return go(); });
      raf = requestAnimationFrame(frame);                              // the bar (visual only)
      timer = setTimeout(function () { if (!holding) return; holding = false; cancelAnimationFrame(raf); fill.style.width = "100%"; finish(); }, HOLD_MS);
    }
    function up(e) {
      if (e && e.type === "keyup" && e.key !== " " && e.key !== "Enter") return;
      if (!holding) return;
      holding = false; cancelAnimationFrame(raf); clearTimeout(timer); fill.style.width = "0"; say("Keep holding until the bar fills.", true);
    }
    function finish() {
      busy = true; btn.disabled = true; label.textContent = "Checking…"; say("");
      hsP.then(function (r) {
        if (!r || !r.token) throw r || {};
        var wait = Math.max(0, GAP_MS - (Date.now() - hsAt));
        return new Promise(function (ok) { setTimeout(ok, wait); }).then(function () { return post({ action: "hold_end", token: r.token }); });
      }).then(function (r) {
        if (!r || !r.pass) throw r || {};
        pass = r.pass; busy = false; el.classList.add("ok"); label.textContent = "✓ Thanks, you're a person"; say("");
      }).catch(function (r) { token = null; reset((r && r.error) || "Please hold the button again."); });
    }
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up); btn.addEventListener("pointercancel", up); btn.addEventListener("lostpointercapture", up);
    btn.addEventListener("keydown", down); btn.addEventListener("keyup", up);
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    btn.addEventListener("click", function (e) { e.preventDefault(); });
    start();
    return {
      ready: function () { return !!pass; },
      // Sends the form through the server check. Resolves { ok, id, cal } or { error }.
      submit: function (body) {
        if (!pass) { say("Please press and hold the button first.", true); try { btn.focus(); } catch (_x) {} return Promise.resolve({ error: "Please press and hold the button to confirm you're a person.", needHold: true }); }
        var b = { action: "submit", brand: brand, pass: pass, hp: body.hp || "", form: body.form || {} };
        if (body.workspace_id) b.workspace_id = body.workspace_id;
        return post(b).then(function (r) {
          if (r && r.ok) { pass = null; return r; }
          if (r && r.code && r.code !== "fast") { token = null; reset(r.error); }   // needs a fresh hold
          return r || { error: "Something went wrong. Please try again." };
        });
      },
      reset: function () { token = null; reset(); }
    };
  }
  window.HumanCheck = { mount: mount };
})();
