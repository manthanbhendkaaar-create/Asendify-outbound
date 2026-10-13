// Monthly plans paid in ₹ through Razorpay (customers in India: UPI Autopay, cards, net banking).
// Used by the free-trial screen (trial.js) and Settings (app.js). Server side: Supabase function "rzpbill".
(function () {
  window.AO_INR = { base: 5376, pro: 14644, scale: 33181 };   // per month, incl. the 45% service fee
  window.inr = function (n) { return "₹" + Number(n).toLocaleString("en-IN"); };

  async function call(action, body) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(SB_URL + "/functions/v1/rzpbill", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, apikey: SB_KEY },
      body: JSON.stringify(Object.assign({ action: action }, body || {})) });
    return r.json().catch(function () { return { error: "Network error. Please try again." }; });
  }
  function loadCheckout() {
    return new Promise(function (ok, bad) {
      if (window.Razorpay) return ok();
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = ok; s.onerror = function () { bad(new Error("Could not load Razorpay. Please check your connection.")); };
      document.head.appendChild(s);
    });
  }

  // Starts a ₹ subscription for the plan. done(err) is called with an error message, or null once the plan is on.
  window.aoRzpSubscribe = async function (plan, done) {
    let r;
    try { r = await call("subscribe", { plan: plan }); await loadCheckout(); }
    catch (e) { return done(e.message || "Something went wrong. Please try again."); }
    if (!r || !r.subscription_id) return done((r && r.error) || "Something went wrong. Please try again.");
    const name = plan[0].toUpperCase() + plan.slice(1);
    const rz = new Razorpay({
      key: r.key_id, subscription_id: r.subscription_id,
      name: "Asendify Outbound", description: name + " plan, " + inr(r.amount_inr) + "/month" + (r.trial ? " (first payment after 14 days)" : ""),
      prefill: { email: (typeof USER !== "undefined" && USER && USER.email) || "" },
      theme: { color: "#4f46e5" },
      handler: async function () {
        let a = {};
        for (let i = 0; i < 5; i++) { a = await call("activate", { subscription_id: r.subscription_id }); if (a.ok) break; await new Promise(function (res) { setTimeout(res, 3000); }); }
        if (!a.ok) return done("We couldn't confirm it yet. Refresh in a minute, or email us if it doesn't update.");
        await reloadWS();
        toast("You're on the " + name + " plan. Thank you!");
        done(null);
        if (location.hash === "#settings") viewSettings();
      },
      modal: { ondismiss: function () { done("Checkout closed. Nothing was charged."); } },
    });
    rz.on("payment.failed", function (resp) { done((resp && resp.error && resp.error.description) || "The payment didn't go through. Please try again."); });
    rz.open();
  };

  window.aoRzpCancel = function () { return call("cancel"); };

  // Settings > Plan: "Billed in ₹ through Razorpay" + cancel for Razorpay subscribers; ₹ plan buttons for everyone else.
  function patchSettings(root) {
    const panel = Array.from(root.querySelectorAll(".panel")).find(function (p) { const h = p.querySelector("h3"); return h && h.textContent === "Plan"; });
    if (!panel || panel.dataset.rzpDone || typeof WS === "undefined" || !WS) return;
    panel.dataset.rzpDone = "1";
    const rzpOn = !!WS.rzp_subscription_id && WS.billing_status !== "CANCELLED" && ["base", "pro", "scale"].includes(WS.plan);
    if (rzpOn) {
      const line = document.createElement("p");
      line.className = "small"; line.style.marginTop = "6px";
      line.innerHTML = 'Billed monthly in ₹ through Razorpay. <a href="#" id="rCancel" style="color:var(--bad)">Cancel subscription</a>';
      panel.querySelector("p.small").after(line);
      panel.querySelectorAll("[data-sub]").forEach(function (b) {
        const s = document.createElement("span"); s.className = "small"; s.textContent = "To switch, cancel your current plan first."; b.replaceWith(s);
      });
      line.querySelector("#rCancel").onclick = async function (e) {
        e.preventDefault();
        if (!confirm("Cancel your subscription? Your plan stays on until the end of the month you paid for.")) return;
        const r = await aoRzpCancel();
        toast(r.ok ? "Subscription cancelled" : "Couldn't cancel: " + (r.error || ""));
        await reloadWS(); viewSettings();
      };
      return;
    }
    const box = document.createElement("div");
    box.style.cssText = "margin-top:14px;padding-top:14px;border-top:1px solid var(--line,#e5e7eb)";
    box.innerHTML = '<p class="small" style="margin:0 0 8px"><b>In India?</b> Pay monthly in ₹ with UPI, card or net banking through Razorpay (prices include the 45% service fee).</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' + ["base", "pro", "scale"].map(function (id) {
        return '<button class="btn btn-ghost" data-rzp="' + id + '">' + id[0].toUpperCase() + id.slice(1) + ": " + inr(AO_INR[id]) + "/month</button>";
      }).join("") + "</div>";
    panel.appendChild(box);
    box.querySelectorAll("[data-rzp]").forEach(function (bt) {
      bt.onclick = function () {
        const label = bt.textContent; bt.disabled = true; bt.textContent = "Opening Razorpay…";
        aoRzpSubscribe(bt.dataset.rzp, function (err) { bt.disabled = false; bt.textContent = label; if (err) toast(err); });
      };
    });
  }
  const view = document.getElementById("view");
  if (view) { patchSettings(view); new MutationObserver(function () { patchSettings(view); }).observe(view, { childList: true, subtree: true }); }
})();
