// Shows prices in GBP and the 45% service fee under every plan price in the dashboard (Settings > plans).
(function () {
  const RATE = 0.45;
  const money = (n) => "£" + n.toFixed(2);
  function addFees(root) {
    root.querySelectorAll(".price .amt").forEach((el) => {
      if (el.dataset.fee) return;
      const m = el.textContent.match(/\$\s*([\d.]+)\s*\/month/);
      if (!m) return;
      const base = Number(m[1]), fee = Math.round(base * RATE * 100) / 100;
      el.innerHTML = el.innerHTML.replace("$" + m[1], "£" + m[1]);   // plans are billed in GBP
      const line = document.createElement("div");
      line.className = "small";
      line.innerHTML = "+ 45% service fee (" + money(fee) + ") = <b>" + money(base + fee) + "/month</b>";
      el.after(line); el.dataset.fee = "1";
    });
  }
  const view = document.getElementById("view");
  if (view) { addFees(view); new MutationObserver(() => addFees(view)).observe(view, { childList: true, subtree: true }); }
})();
