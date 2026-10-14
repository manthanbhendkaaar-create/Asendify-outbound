// Card-required free trial (sign-ups from 9 Oct 2026). A new workspace picks a plan and adds a card or PayPal
// through PayPal before it can send. Nothing is charged for 14 days; the plan then starts automatically unless
// it is cancelled in Settings before then.
(function () {
  var PLANS = [
    { id: "base", name: "Base", price: "£29", total: "£42.05", info: "6,000 emails / month · 2,000 contacts" },
    { id: "pro", name: "Pro", price: "£79", total: "£114.55", info: "100,000 emails / month · 30,000 contacts", hot: true },
    { id: "scale", name: "Scale", price: "£179", total: "£259.55", info: "300,000 emails / month · 100,000 contacts" },
  ];
  var sub = document.getElementById("authSub");
  function fixSub() { if (sub && /no card needed/i.test(sub.textContent)) sub.textContent = "14 days free. Add a card or PayPal to start; nothing is charged for 14 days."; }
  if (sub) { fixSub(); new MutationObserver(fixSub).observe(sub, { childList: true, characterData: true, subtree: true }); }

  var t0 = Date.now(), box = null, inrMode = false;
  function ws() { try { return typeof WS !== "undefined" ? WS : null; } catch (e) { return null; } }
  function needsCard() { var w = ws(); return !!(w && w.card_required && !w.paypal_subscription_id && !w.rzp_subscription_id && !w.rzp_token_id); }   // 2026-10-14: rzp_token_id = ₹ bank mandate
  function returning() { return /[?&]billing=ok/.test(location.search) && Date.now() - t0 < 20000; }
  function firstCharge() { return new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long" }); }

  var LEAD_GBP, LEAD_INR;
  function show() {
    inrMode = false;
    LEAD_GBP = "Pick a plan and add a card or PayPal through PayPal. <b>You pay nothing today.</b> Your first payment is on " + firstCharge() +
      ", and you can cancel any time before then in Settings so you're never charged.";
    LEAD_INR = "Pick a plan and set up monthly autopay with UPI, a card or net banking through Razorpay. <b>You pay nothing today.</b> Your first payment is on " + firstCharge() +
      ", and you can cancel any time before then in Settings so you're never charged.";
    box = document.createElement("div");
    box.id = "cardTrial";
    box.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(15,17,26,.72);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:40px 16px";
    var cards = PLANS.map(function (p) {
      return '<div style="flex:1 1 200px;border:' + (p.hot ? "2px solid var(--brand,#4f46e5)" : "1px solid var(--line,#e5e7eb)") + ';border-radius:14px;padding:18px;background:#fff">' +
        '<div style="font-weight:700">' + p.name + (p.hot ? ' <span style="font-size:12px;color:var(--brand,#4f46e5)">Most popular</span>' : "") + "</div>" +
        '<div class="ct-gbp"><div style="font-size:28px;font-weight:800;margin:6px 0 2px">' + p.price + '<small style="font-size:14px;font-weight:500">/month</small></div>' +
        '<div style="font-size:13px;color:#6b7280">+ 45% service fee = <b>' + p.total + '/month</b></div></div>' +
        '<div class="ct-inr" style="display:none"><div style="font-size:28px;font-weight:800;margin:6px 0 2px">' + inr(AO_INR[p.id]) + '<small style="font-size:14px;font-weight:500">/month</small></div>' +
        '<div style="font-size:13px;color:#6b7280">incl. 45% service fee</div></div>' +
        '<div style="font-size:13px;color:#6b7280;margin:8px 0 14px">' + p.info + "</div>" +
        '<button class="btn ' + (p.hot ? "btn-primary" : "btn-ghost") + '" data-plan="' + p.id + '" style="width:100%">Start free trial</button></div>';
    }).join("");
    box.innerHTML = '<div style="max-width:760px;width:100%;background:#fff;border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
      '<h2 style="margin:0 0 6px">Start your 14-day free trial</h2>' +
      '<p id="ctLead" style="margin:0 0 18px;color:#4b5563">' + LEAD_GBP + '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px">' + cards + "</div>" +
      '<p id="ctMsg" style="margin:14px 0 0;font-size:14px;color:#6b7280">Every plan includes unlimited inboxes, warm-up and the AI reply agent.</p>' +
      '<p style="margin:10px 0 0;font-size:14px"><a href="#" id="ctInr">In India? Pay in ₹ with UPI, card or net banking (Razorpay)</a></p>' +
      '<p style="margin:10px 0 0;font-size:13px"><a href="#" id="ctOut" style="color:#6b7280">Log out</a></p></div>';
    document.body.appendChild(box);
    box.querySelectorAll("[data-plan]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var msg = document.getElementById("ctMsg");
        box.querySelectorAll("[data-plan]").forEach(function (x) { x.disabled = true; });
        msg.style.color = "#6b7280";
        if (inrMode) {
          b.textContent = "Opening Razorpay…";
          return aoRzpSubscribe(b.dataset.plan, function (err) {
            box && box.querySelectorAll("[data-plan]").forEach(function (x) { x.disabled = false; });
            b.textContent = "Start free trial";
            if (err && box) { msg.style.color = "#b91c1c"; msg.textContent = err; }
          });
        }
        b.textContent = "Opening PayPal…";
        var r = {};
        try { r = await engine("billing_subscribe", { plan: b.dataset.plan }); } catch (e) { r = { error: "Network error. Please try again." }; }
        if (r && r.approve) { location.href = r.approve; return; }
        box.querySelectorAll("[data-plan]").forEach(function (x) { x.disabled = false; });
        b.textContent = "Start free trial"; msg.style.color = "#b91c1c"; msg.textContent = (r && r.error) || "Something went wrong. Please try again.";
      });
    });
    document.getElementById("ctInr").addEventListener("click", function (e) {
      e.preventDefault(); inrMode = !inrMode;
      box.querySelectorAll(".ct-gbp").forEach(function (x) { x.style.display = inrMode ? "none" : ""; });
      box.querySelectorAll(".ct-inr").forEach(function (x) { x.style.display = inrMode ? "" : "none"; });
      this.textContent = inrMode ? "Outside India? Pay in £ with PayPal or card" : "In India? Pay in ₹ with UPI, card or net banking (Razorpay)";
      document.getElementById("ctLead").innerHTML = inrMode ? LEAD_INR : LEAD_GBP;
    });
    document.getElementById("ctOut").addEventListener("click", function (e) { e.preventDefault(); try { sb.auth.signOut(); } catch (x) {} location.href = "/"; });
  }
  function hide() { if (box) { box.remove(); box = null; } }
  setInterval(function () {
    if (needsCard() && !returning()) { if (!box) show(); }
    else if (box) hide();
  }, 700);
})();
