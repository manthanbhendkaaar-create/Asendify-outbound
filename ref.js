// Affiliate tracking: remembers ?ref= for 60 days and credits a brand-new sign-up to that affiliate.
(function () {
  var KEY = "ao_ref", FN = "https://pnokotvssodslxozepxe.supabase.co/functions/v1/affiliate";
  function get() {
    var m = document.cookie.match(/(?:^|; )ao_ref=([a-z0-9]{3,20})/);
    if (m) return m[1];
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function clear() {
    document.cookie = KEY + "=; max-age=0; path=/";
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  var q = (new URLSearchParams(location.search).get("ref") || "").toLowerCase();
  if (/^[a-z0-9]{3,20}$/.test(q) && !get()) {
    document.cookie = KEY + "=" + q + "; max-age=" + 60 * 86400 + "; path=/; samesite=lax; secure";
    try { localStorage.setItem(KEY, q); } catch (e) {}
  }
  if (typeof sb === "undefined") return;   // marketing pages only store the code
  var busy = false;
  async function attach() {
    var ref = get();
    if (!ref || busy) return;
    var s = (await sb.auth.getSession()).data.session;
    if (!s) return;
    busy = true;
    try {
      var r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access_token }, body: JSON.stringify({ action: "attach", ref: ref }) });
      if (r.status === 200) clear();
    } catch (e) { /* try again next visit */ }
    busy = false;
  }
  attach();
  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_IN") setTimeout(attach, 1500); });
})();
