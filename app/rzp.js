// Monthly plans paid in ₹ through Razorpay (customers in India).
// 2026-10-14: Razorpay Subscriptions is off on our account, so ₹ plans now use a one-time bank mandate (eMandate) that we
// debit each month. Used by the free-trial screen (trial.js) and Settings (app.js). Server side: Supabase function "rzpmandate".
(function () {
  window.AO_INR = { base: 5376, pro: 14644, scale: 33181 };   // per month, incl. the 45% service fee
  window.inr = function (n) { return "₹" + Number(n).toLocaleString("en-IN"); };

  async function call(action, body) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(SB_URL + "/functions/v1/rzpmandate", { method: "POST",
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

  // Starts a ₹ plan: the customer sets up a bank mandate (nothing is charged now), we debit the plan each month.
  // done(err) is called with an error message, or null once the plan is on.
  window.aoRzpSubscribe = async function (plan, done) {
    const phone = window.prompt("Your mobile number (10 digits). Razorpay needs it for the bank mandate.", "");
    if (phone === null) return done("Cancelled. Nothing was charged.");
    let r;
    try { r = await call("subscribe", { plan: plan, contact: phone }); await loadCheckout(); }
    catch (e) { return done(e.message || "Something went wrong. Please try again."); }
    if (!r || !r.order_id) return done((r && r.error) || "Something went wrong. Please try again.");
    const name = plan[0].toUpperCase() + plan.slice(1);
    const rz = new Razorpay({
      key: r.key_id, order_id: r.order_id, customer_id: r.customer_id, recurring: "1",
      name: "Asendify Outbound", description: name + " plan: bank mandate for " + inr(r.amount_inr) + "/month" + (r.trial ? " (first debit after 14 days)" : "") + ". Nothing is charged now.",
      prefill: { name: r.name || "", email: r.email || "", contact: r.contact || "" },
      theme: { color: "#d4af37" },
      handler: async function (resp) {
        let a = {};
        for (let i = 0; i < 5; i++) { a = await call("activate", { order_id: r.order_id, payment_id: resp && resp.razorpay_payment_id }); if (a.ok) break; await new Promise(function (res) { setTimeout(res, 3000); }); }
        if (!a.ok) return done("We couldn't confirm it yet. Refresh in a minute, or email us if it doesn't update.");
        await reloadWS();
        // 2026-10-19 (Manthan): outside the free trial the plan starts when the first monthly debit clears.
        if (a.pending) toast("Bank mandate set up. Your " + name + " plan starts as soon as the first debit of " + inr(r.amount_inr) + " clears (usually 1-3 working days).");
        else toast("You're on the " + name + " plan. Thank you!");
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
    const rzpOn = !!WS.rzp_token_id && WS.billing_status !== "CANCELLED" && ["base", "pro", "scale"].includes(WS.plan);
    if (rzpOn) {
      const line = document.createElement("p");
      line.className = "small"; line.style.marginTop = "6px";
      line.innerHTML = 'Billed monthly in ₹ from your bank mandate (Razorpay). <a href="#" id="rCancel" style="color:var(--bad)">Cancel plan</a>';
      panel.querySelector("p.small").after(line);
      panel.querySelectorAll("[data-sub]").forEach(function (b) {
        const s = document.createElement("span"); s.className = "small"; s.textContent = "To switch, cancel your current plan first."; b.replaceWith(s);
      });
      line.querySelector("#rCancel").onclick = async function (e) {
        e.preventDefault();
        if (!confirm("Cancel your plan? It stays on until the end of the month you paid for, and nothing more is debited.")) return;
        const r = await aoRzpCancel();
        toast(r.ok ? "Plan cancelled" : "Couldn't cancel: " + (r.error || ""));
        await reloadWS(); viewSettings();
      };
      return;
    }
    const box = document.createElement("div");
    box.style.cssText = "margin-top:14px;padding-top:14px;border-top:1px solid var(--line,#e5e7eb)";
    box.innerHTML = '<p class="small" style="margin:0 0 8px"><b>In India?</b> Pay monthly in ₹ through a bank mandate with Razorpay: set it up once, nothing is charged until your plan is due (prices include the 45% service fee).</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' + ["base", "pro", "scale"].map(function (id) {
        return '<button class="paybtn alt btn btn-ghost" data-rzp="' + id + '">' + id[0].toUpperCase() + id.slice(1) + ": " + inr(AO_INR[id]) + "/month</button>";
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
