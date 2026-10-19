// Asendify Outbound dashboard (vanilla JS + Supabase).
const SB_URL = "https://pnokotvssodslxozepxe.supabase.co";
const SB_KEY = "sb_publishable_oRuoWNZbUJe3hnFYrOlAdg_Q5YBl5Z_";
const sb = supabase.createClient(SB_URL, SB_KEY);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = (t) => { const el = $("#toast"); el.textContent = t; el.classList.remove("hidden"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 3500); };
let WS = null, USER = null;

const PROVIDERS = {
  gmail: { label: "Gmail / Google Workspace", smtp: "smtp.gmail.com", imap: "imap.gmail.com" },
  zoho: { label: "Zoho Mail", smtp: "smtp.zoho.com", imap: "imap.zoho.com" },
  custom: { label: "Other (IMAP/SMTP)", smtp: "", imap: "" },
};

async function engine(action, body = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(SB_URL + "/functions/v1/engine", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token, apikey: SB_KEY },
    body: JSON.stringify({ action, ...body }) });
  return r.json();
}

// ---------------------------------------------------------------- auth
let signupMode = new URLSearchParams(location.search).get("signup") === "1";
function authMode() {
  $("#authTitle").textContent = signupMode ? "Start your free trial" : "Log in";
  $("#authSub").textContent = signupMode ? "14 days free. No card needed." : "Welcome back.";
  $("#aGo").textContent = signupMode ? "Create account" : "Log in";
  $("#aSwitch").textContent = signupMode ? "Already have an account? Log in" : "New here? Start your free trial";
}
$("#aSwitch").onclick = (e) => { e.preventDefault(); signupMode = !signupMode; authMode(); };
$("#aGo").onclick = async () => {
  const email = $("#aEmail").value.trim(), password = $("#aPass").value;
  $("#aMsg").textContent = "";
  if (!email || password.length < 8) { $("#aMsg").textContent = "Enter your email and a password of at least 8 characters."; return; }
  $("#aGo").disabled = true;
  if (signupMode) {
    const r = await fetch(SB_URL + "/functions/v1/signup", { method: "POST", headers: { "Content-Type": "application/json", apikey: SB_KEY }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $("#aGo").disabled = false; $("#aMsg").textContent = j.error || "Couldn't create the account."; return; }
  }
  const res = await sb.auth.signInWithPassword({ email, password });
  $("#aGo").disabled = false;
  if (res.error) { $("#aMsg").textContent = res.error.message; return; }
  boot();
};
$("#logout").onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); location.href = "/"; };

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { authMode(); $("#auth").classList.remove("hidden"); $("#app").classList.add("hidden"); return; }
  USER = session.user;
  const { data: m } = await sb.from("workspace_members").select("workspace_id").eq("user_id", USER.id).limit(1);
  const { data: ws } = await sb.from("workspaces").select("*").eq("id", m[0].workspace_id).single();
  WS = ws;
  $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden");
  planBox();
  if (new URLSearchParams(location.search).get("billing")) location.hash = "settings";
  route();
  handleBillingReturn().then(() => { if (location.hash === "#settings") viewSettings(); });
}
async function reloadWS() { const { data } = await sb.from("workspaces").select("*").eq("id", WS.id).single(); if (data) WS = data; planBox(); }
function planLine() {
  if (WS.plan === "trial") return trialDaysLeft() > 0 ? `Free trial, ${trialDaysLeft()} days left.` : "Your free trial has ended. Choose a plan to keep sending.";
  if (WS.plan === "cancelled") return "Your plan has ended. Choose a plan to start sending again.";
  const until = WS.paid_until ? new Date(WS.paid_until).toLocaleDateString() : "";
  return "Current plan: " + esc(WS.plan[0].toUpperCase() + WS.plan.slice(1)) + (WS.billing_status === "CANCELLED" && until ? ` (cancelled, active until ${until})` : until ? ` (renews ${until})` : "");
}
async function handleBillingReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.get("billing")) return;
  const sub = q.get("subscription_id");
  history.replaceState(null, "", "/app/#settings");
  if (q.get("billing") === "cancel") { toast("Checkout cancelled. No payment was taken."); return; }
  if (!sub) return;
  toast("Confirming your payment…");
  let r = {};
  for (let i = 0; i < 4; i++) { r = await engine("billing_activate", { subscription_id: sub }); if (r.ok) break; await new Promise((res) => setTimeout(res, 3000)); }
  if (r.ok) { await reloadWS(); toast("You're on the " + r.plan[0].toUpperCase() + r.plan.slice(1) + " plan. Thank you!"); }
  else toast("We couldn't confirm the payment yet. Refresh in a minute, or email us if it doesn't update.");
}
function trialDaysLeft() { return Math.max(0, Math.ceil((Date.parse(WS.trial_ends_at) - Date.now()) / 86400000)); }
function planBox() {
  const p = WS.plan;
  $("#planBox").innerHTML = p === "trial"
    ? `<b>Free trial</b><br>${trialDaysLeft()} days left<br><a href="#settings" style="color:var(--brand);font-weight:600">Choose a plan</a>`
    : p === "cancelled" ? `<b>No active plan</b><br><a href="#settings" style="color:var(--brand);font-weight:600">Choose a plan</a>`
    : `<b>${esc(p[0].toUpperCase() + p.slice(1))} plan</b><br>${WS.contacts_limit.toLocaleString()} contacts`;
}
window.addEventListener("hashchange", () => USER && route());

function route() {
  const h = location.hash.slice(1) || "campaigns";
  const [v, id] = h.split("/");
  document.querySelectorAll("aside nav a").forEach((a) => a.classList.toggle("on", a.dataset.v === v || (v === "campaign" && a.dataset.v === "campaigns")));
  ({ campaigns: viewCampaigns, campaign: () => viewCampaign(id), mailboxes: viewMailboxes, inbox: viewInbox, settings: viewSettings }[v] || viewCampaigns)();
  refreshInboxBadge();
}
async function refreshInboxBadge() {
  const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("workspace_id", WS.id).eq("direction", "in").eq("ai_status", "draft");
  $("#inboxCount").textContent = count || ""; $("#inboxCount").classList.toggle("hidden", !count);
}

// ---------------------------------------------------------------- mailboxes
async function viewMailboxes() {
  const { data: mbs } = await sb.from("mailboxes").select("*").eq("workspace_id", WS.id).order("created_at");
  const { data: cnt } = await sb.from("send_counters").select("*").in("mailbox_id", (mbs || []).map((m) => m.id)).eq("day", new Date().toISOString().slice(0, 10));
  const today = new Map((cnt || []).map((c) => [c.mailbox_id, c]));
  $("#view").innerHTML = `
  <div class="head"><h1>Email accounts</h1><button class="btn btn-primary" id="addMb">Add email account</button></div>
  <div class="panel" id="mbForm" style="display:none"></div>
  <div class="panel">${(mbs || []).length ? `<table class="t"><tr><th>Account</th><th>Status</th><th>Sent today</th><th>Daily limit</th><th>Warm-up</th><th></th></tr>
  ${mbs.map((m) => { const c = today.get(m.id) || { sent: 0, warmup_sent: 0 };
    return `<tr><td><b>${esc(m.email)}</b><br><span class="small">${esc(m.from_name)}</span>${m.last_error ? `<br><span class="small" style="color:var(--bad)">${esc(m.last_error).slice(0, 140)}</span>` : ""}</td>
    <td><span class="st ${m.status}">${m.status}</span></td><td>${c.sent} + ${c.warmup_sent} warm-up</td>
    <td><input type="number" min="1" max="200" value="${m.daily_limit}" data-lim="${m.id}" style="width:80px;margin:0"></td>
    <td><input type="checkbox" ${m.warmup_enabled ? "checked" : ""} data-wu="${m.id}" style="width:auto"></td>
    <td><button class="btn btn-ghost" data-test="${m.id}">Test</button> <button class="btn btn-ghost" data-del="${m.id}">Remove</button></td></tr>`; }).join("")}</table>`
  : `<p class="small">No email accounts yet. Add your first one to start sending.</p>`}</div>`;
  $("#addMb").onclick = () => mailboxForm();
  document.querySelectorAll("[data-lim]").forEach((el) => el.onchange = async () => { await sb.from("mailboxes").update({ daily_limit: Math.max(1, Math.min(200, +el.value)) }).eq("id", el.dataset.lim); toast("Daily limit saved"); });
  document.querySelectorAll("[data-wu]").forEach((el) => el.onchange = async () => { await sb.from("mailboxes").update({ warmup_enabled: el.checked }).eq("id", el.dataset.wu); toast(el.checked ? "Warm-up on" : "Warm-up off"); });
  document.querySelectorAll("[data-test]").forEach((el) => el.onclick = async () => { el.textContent = "Testing…"; const r = await engine("test", { mailbox_id: el.dataset.test }); toast(r.ok ? "Connected" : "Failed: " + (r.error || "").slice(0, 120)); viewMailboxes(); });
  document.querySelectorAll("[data-del]").forEach((el) => el.onclick = async () => { if (!confirm("Remove this email account?")) return; await sb.from("mailboxes").delete().eq("id", el.dataset.del); viewMailboxes(); });
  if (!(mbs || []).length) mailboxForm();
}
function mailboxForm() {
  const f = $("#mbForm"); f.style.display = "block";
  f.innerHTML = `<h3>Connect an email account</h3>
  <div class="row"><label>Provider<select id="mProv">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join("")}</select></label>
  <label>Sender name<input id="mName" placeholder="Jane Smith"></label></div>
  <div class="row"><label>Email address<input id="mEmail" type="email" placeholder="jane@yourdomain.com"></label>
  <label>App password<input id="mPass" type="password" placeholder="16-character app password"></label></div>
  <div class="row3" id="mHosts" style="display:none"><label>SMTP host (SSL, port 465)<input id="mSmtp"></label><label>IMAP host (SSL, port 993)<input id="mImap"></label><label>Username<input id="mUser" placeholder="usually the email"></label></div>
  <div class="row"><label>Daily sending limit<input id="mLim" type="number" value="30" min="1" max="200"></label><label>Signature (optional)<input id="mSig" placeholder="Jane Smith · Acme"></label></div>
  <div class="help" id="mHelp"></div>
  <div style="margin-top:16px;display:flex;gap:10px"><button class="btn btn-primary" id="mSave">Connect</button><button class="btn btn-ghost" id="mCancel">Cancel</button></div><p class="msg" id="mMsg"></p>`;
  const help = () => { const p = $("#mProv").value; $("#mHosts").style.display = p === "custom" ? "grid" : "none";
    $("#mHelp").innerHTML = p === "gmail" ? `<b>Gmail / Google Workspace:</b><ol><li>Turn on 2-Step Verification for the account.</li><li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color:var(--brand)">myaccount.google.com/apppasswords</a> and create an app password called "Outbound".</li><li>Paste the 16-character password here (spaces don't matter).</li></ol>`
      : p === "zoho" ? `<b>Zoho Mail:</b> enable IMAP in Zoho Mail settings, then create an app-specific password under My Account → Security → App Passwords. If your account is on zoho.eu or zoho.in, choose "Other" and use smtp.zoho.eu / imap.zoho.eu (or .in).`
      : `<b>Other providers:</b> use SSL ports (SMTP 465, IMAP 993). Outlook / Office 365 can't send from the platform yet.`; };
  $("#mProv").onchange = help; help();
  $("#mCancel").onclick = () => { f.style.display = "none"; };
  $("#mSave").onclick = async () => {
    const prov = $("#mProv").value, P = PROVIDERS[prov], email = $("#mEmail").value.trim().toLowerCase(), pass = $("#mPass").value.replace(/\s+/g, "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !pass) { $("#mMsg").textContent = "Enter the email and its app password."; return; }
    $("#mSave").disabled = true; $("#mMsg").style.color = "var(--muted)"; $("#mMsg").textContent = "Connecting…";
    const row = { workspace_id: WS.id, email, from_name: $("#mName").value.trim(), provider: prov === "custom" ? "custom" : prov,
      smtp_host: prov === "custom" ? $("#mSmtp").value.trim() : P.smtp, imap_host: prov === "custom" ? $("#mImap").value.trim() : P.imap,
      username: prov === "custom" ? ($("#mUser").value.trim() || email) : email, daily_limit: +$("#mLim").value || 30, signature: $("#mSig").value.trim() };
    const { data: mb, error } = await sb.from("mailboxes").insert(row).select().single();
    if (error) { $("#mSave").disabled = false; $("#mMsg").style.color = "var(--bad)"; $("#mMsg").textContent = error.message; return; }
    const s = await sb.rpc("set_mailbox_secret", { p_mailbox: mb.id, p_password: pass });
    if (s.error) { $("#mMsg").textContent = s.error.message; $("#mSave").disabled = false; return; }
    const t = await engine("test", { mailbox_id: mb.id });
    $("#mSave").disabled = false;
    if (t.ok) { toast("Connected " + email); viewMailboxes(); }
    else { $("#mMsg").style.color = "var(--bad)"; $("#mMsg").textContent = "Couldn't connect: " + (t.error || "check the app password").slice(0, 200); }
  };
}

// ---------------------------------------------------------------- campaigns
async function viewCampaigns() {
  const { data: cs } = await sb.from("campaigns").select("*").eq("workspace_id", WS.id).order("created_at", { ascending: false });
  const stats = {};
  for (const c of cs || []) {
    const [{ count: leads }, { count: sent }, { count: replies }] = await Promise.all([
      sb.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("direction", "out"),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("direction", "in")]);
    stats[c.id] = { leads, sent, replies };
  }
  $("#view").innerHTML = `<div class="head"><h1>Campaigns</h1><button class="btn btn-primary" id="newC">New campaign</button></div>
  <div class="panel">${(cs || []).length ? `<table class="t"><tr><th>Campaign</th><th>Status</th><th>Leads</th><th>Sent</th><th>Replies</th></tr>
  ${cs.map((c) => `<tr class="click" data-c="${c.id}"><td><b>${esc(c.name)}</b></td><td><span class="st ${c.status}">${c.status}</span></td><td>${stats[c.id].leads || 0}</td><td>${stats[c.id].sent || 0}</td><td>${stats[c.id].replies || 0}</td></tr>`).join("")}</table>`
  : `<p class="small">No campaigns yet. Create one, add your leads and write your sequence.</p>`}</div>`;
  document.querySelectorAll("[data-c]").forEach((r) => r.onclick = () => location.hash = "campaign/" + r.dataset.c);
  $("#newC").onclick = async () => {
    const name = prompt("Campaign name", "New campaign"); if (!name) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const { data: c, error } = await sb.from("campaigns").insert({ workspace_id: WS.id, name, timezone: tz }).select().single();
    if (error) return toast(error.message);
    await sb.from("campaign_steps").insert([
      { campaign_id: c.id, step_no: 1, delay_days: 0, subject: "quick question, {{company|your team}}", body: "Hi {{first_name|there}},\n\n\n\n{{sender_name}}" },
      { campaign_id: c.id, step_no: 2, delay_days: 3, subject: "", body: "Hi {{first_name|there}}, just bumping this in case it got buried.\n\n{{sender_name}}" }]);
    location.hash = "campaign/" + c.id;
  };
}

let CTAB = "sequence";
async function viewCampaign(id) {
  const { data: c } = await sb.from("campaigns").select("*").eq("id", id).single();
  if (!c) return viewCampaigns();
  const q = (st) => { let x = sb.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", id); return st ? x.in("status", st) : x; };
  const [{ count: leads }, { count: sent }, { count: replies }, { count: interested }, { count: bounced }] = await Promise.all([q(),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("direction", "out"),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("direction", "in"), q(["interested"]), q(["bounced"])]);
  $("#view").innerHTML = `<div class="head"><h1>${esc(c.name)} <span class="st ${c.status}" style="font-size:13px;vertical-align:middle">${c.status}</span></h1>
  <div style="display:flex;gap:8px"><a class="btn btn-ghost" href="#campaigns">Back</a>${c.status === "active" ? `<button class="btn btn-ghost" id="pause">Pause</button>` : `<button class="btn btn-primary" id="start">Start campaign</button>`}</div></div>
  <div class="kpis"><div class="kpi"><b>${leads || 0}</b><span>Leads</span></div><div class="kpi"><b>${sent || 0}</b><span>Emails sent</span></div><div class="kpi"><b>${replies || 0}</b><span>Replies</span></div><div class="kpi"><b>${interested || 0}</b><span>Interested</span></div><div class="kpi"><b>${bounced || 0}</b><span>Bounced</span></div></div>
  <div class="tabs">${["sequence", "leads", "settings"].map((t) => `<a href="#" data-t="${t}" class="${CTAB === t ? "on" : ""}">${t[0].toUpperCase() + t.slice(1)}</a>`).join("")}</div><div id="ctab"></div>`;
  document.querySelectorAll("[data-t]").forEach((a) => a.onclick = (e) => { e.preventDefault(); CTAB = a.dataset.t; viewCampaign(id); });
  if ($("#start")) $("#start").onclick = () => startCampaign(c);
  if ($("#pause")) $("#pause").onclick = async () => { await sb.from("campaigns").update({ status: "paused" }).eq("id", id); toast("Paused"); viewCampaign(id); };
  ({ sequence: tabSequence, leads: tabLeads, settings: tabSettings }[CTAB])(c);
}

async function startCampaign(c) {
  if (WS.plan === "trial" && trialDaysLeft() <= 0) return toast("Your trial has ended. Choose a plan in Settings to keep sending.");
  if (["cancelled"].includes(WS.plan)) return toast("Choose a plan in Settings to send.");
  const [{ count: steps }, { count: leads }] = await Promise.all([sb.from("campaign_steps").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
    sb.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", c.id)]);
  if (!steps) return toast("Add at least one email to the sequence.");
  if (!leads) return toast("Add leads first.");
  if (!(c.mailbox_ids || []).length) { CTAB = "settings"; viewCampaign(c.id); return toast("Pick the email accounts to send from."); }
  await sb.from("campaigns").update({ status: "active" }).eq("id", c.id);
  toast("Campaign started. Emails go out inside your sending hours."); viewCampaign(c.id);
}

async function tabSequence(c) {
  const { data: steps } = await sb.from("campaign_steps").select("*").eq("campaign_id", c.id).order("step_no").order("variant");
  $("#ctab").innerHTML = `<div class="panel"><p class="small">Use {{first_name}}, {{company}}, {{website}} or any column from your CSV, with a fallback like {{first_name|there}}. {Hi|Hey|Hello} picks one at random. Leave a follow-up subject empty to reply in the same thread.</p></div>
  ${(steps || []).map((s) => `<div class="step" data-s="${s.id}"><div class="bar"><span>Email ${s.step_no}${s.variant !== "A" ? " · variant " + s.variant : ""}</span>
  <span class="small">${s.step_no > 1 ? `Send <input type="number" min="0" value="${s.delay_days}" data-f="delay_days" style="width:64px;margin:0 4px;display:inline-block"> days after the previous email` : "Sent first"}
   <button class="btn btn-ghost" data-ab="${s.step_no}" style="padding:5px 10px;margin-left:8px">+ A/B</button> <button class="btn btn-ghost" data-rm="${s.id}" style="padding:5px 10px">Delete</button></span></div>
  <label>Subject<input data-f="subject" value="${esc(s.subject)}" placeholder="${s.step_no > 1 ? "(empty = same thread)" : ""}"></label>
  <label>Body<textarea data-f="body">${esc(s.body)}</textarea></label></div>`).join("")}
  <div style="display:flex;gap:10px"><button class="btn btn-ghost" id="addStep">Add follow-up</button><button class="btn btn-primary" id="saveSeq">Save sequence</button></div>`;
  $("#addStep").onclick = async () => { const n = Math.max(0, ...(steps || []).map((s) => s.step_no)) + 1;
    await sb.from("campaign_steps").insert({ campaign_id: c.id, step_no: n, delay_days: 3, subject: "", body: "Hi {{first_name|there}},\n\n\n\n{{sender_name}}" }); tabSequence(c); };
  document.querySelectorAll("[data-ab]").forEach((b) => b.onclick = async () => { const n = +b.dataset.ab; const have = (steps || []).filter((s) => s.step_no === n).map((s) => s.variant);
    const v = ["B", "C"].find((x) => !have.includes(x)); if (!v) return toast("Up to 3 variants per email.");
    const base = steps.find((s) => s.step_no === n);
    await sb.from("campaign_steps").insert({ campaign_id: c.id, step_no: n, variant: v, delay_days: base.delay_days, subject: base.subject, body: base.body }); tabSequence(c); });
  document.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => { if (!confirm("Delete this email?")) return; await sb.from("campaign_steps").delete().eq("id", b.dataset.rm); tabSequence(c); });
  $("#saveSeq").onclick = async () => {
    for (const el of document.querySelectorAll("[data-s]")) {
      const upd = {}; el.querySelectorAll("[data-f]").forEach((f) => upd[f.dataset.f] = f.dataset.f === "delay_days" ? +f.value : f.value);
      await sb.from("campaign_steps").update(upd).eq("id", el.dataset.s);
    }
    toast("Sequence saved");
  };
}

function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === "," || ch === ";" || ch === "\t") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const norm = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const MAP = { email: ["email", "email_address", "e_mail", "mail"], first_name: ["first_name", "firstname", "first", "name"], last_name: ["last_name", "lastname", "surname", "last"],
  company: ["company", "company_name", "organization", "organisation", "business"], website: ["website", "url", "domain", "site", "web"] };

async function tabLeads(c) {
  const { data: rows } = await sb.from("leads").select("email,first_name,company,status,verify_status,current_step").eq("campaign_id", c.id).order("created_at", { ascending: false }).limit(100);
  $("#ctab").innerHTML = `<div class="panel"><h3>Add leads</h3><p class="small">Upload a CSV with an email column. First name, company, website and any other columns become merge fields.</p>
  <input type="file" id="csv" accept=".csv,text/csv" style="margin-top:10px"><p class="msg" id="lMsg"></p>
  <div style="display:flex;gap:10px;margin-top:6px"><button class="btn btn-ghost" id="verify">Check emails</button></div></div>
  <div class="panel"><table class="t"><tr><th>Email</th><th>Name</th><th>Company</th><th>Check</th><th>Status</th><th>Step</th></tr>
  ${(rows || []).map((l) => `<tr><td>${esc(l.email)}</td><td>${esc(l.first_name)}</td><td>${esc(l.company)}</td><td><span class="st ${l.verify_status}">${l.verify_status}</span></td><td><span class="st ${l.status}">${l.status}</span></td><td>${l.current_step}</td></tr>`).join("")}</table>
  ${(rows || []).length === 100 ? `<p class="small" style="margin-top:8px">Showing the latest 100.</p>` : ""}</div>`;
  $("#verify").onclick = async () => { $("#verify").textContent = "Checking…"; const r = await engine("verify", { campaign_id: c.id }); toast(`Valid ${r.valid ?? 0} · risky ${r.risky ?? 0} · invalid ${r.invalid ?? 0}`); tabLeads(c); };
  $("#csv").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const data = parseCSV(await file.text()); if (data.length < 2) { $("#lMsg").textContent = "The file looks empty."; return; }
    const head = data[0].map(norm); const idx = {};
    for (const [k, alts] of Object.entries(MAP)) idx[k] = head.findIndex((h) => alts.includes(h));
    if (idx.email < 0) { $("#lMsg").textContent = "No email column found."; return; }
    const { count: have } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", WS.id);
    const room = Math.max(0, WS.contacts_limit - (have || 0));
    const { data: steps } = await sb.from("campaign_steps").select("variant").eq("campaign_id", c.id);
    const variants = [...new Set((steps || []).map((s) => s.variant))];
    const seen = new Set(); const out = [];
    for (const r of data.slice(1)) {
      const email = String(r[idx.email] || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || seen.has(email)) continue; seen.add(email);
      const custom = {}; head.forEach((h, i) => { if (!Object.values(idx).includes(i) && h) custom[h] = (r[i] || "").trim(); });
      let first = idx.first_name >= 0 ? (r[idx.first_name] || "").trim() : "";
      if (head[idx.first_name] === "name") first = first.split(" ")[0];
      out.push({ workspace_id: WS.id, campaign_id: c.id, email, first_name: first, last_name: idx.last_name >= 0 ? (r[idx.last_name] || "").trim() : "",
        company: idx.company >= 0 ? (r[idx.company] || "").trim() : "", website: idx.website >= 0 ? (r[idx.website] || "").trim() : "", custom,
        variant: variants[Math.floor(Math.random() * variants.length)] || "A" });
    }
    const take = out.slice(0, room);
    $("#lMsg").style.color = "var(--muted)"; $("#lMsg").textContent = `Uploading ${take.length} leads…`;
    for (let i = 0; i < take.length; i += 500) {
      const { error } = await sb.from("leads").upsert(take.slice(i, i + 500), { onConflict: "campaign_id,email", ignoreDuplicates: true });
      if (error) { $("#lMsg").style.color = "var(--bad)"; $("#lMsg").textContent = error.message; return; }
    }
    toast(`Added ${take.length} leads` + (out.length > take.length ? ` (${out.length - take.length} over your plan limit were skipped)` : ""));
    tabLeads(c);
  };
}

async function tabSettings(c) {
  const { data: mbs } = await sb.from("mailboxes").select("id,email,status").eq("workspace_id", WS.id);
  const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  $("#ctab").innerHTML = `<div class="panel"><h3>Send from</h3>${(mbs || []).length ? (mbs || []).map((m) => `<label class="chk"><input type="checkbox" data-mb="${m.id}" ${(c.mailbox_ids || []).includes(m.id) ? "checked" : ""}> ${esc(m.email)} <span class="st ${m.status}">${m.status}</span></label>`).join("") : `<p class="small">No email accounts yet. <a href="#mailboxes" style="color:var(--brand)">Add one</a>.</p>`}</div>
  <div class="panel"><h3>Schedule</h3><div class="row3"><label>Time zone<input id="sTz" value="${esc(c.timezone)}"></label><label>From<input id="sFrom" type="time" value="${String(c.send_start).slice(0, 5)}"></label><label>Until<input id="sTo" type="time" value="${String(c.send_end).slice(0, 5)}"></label></div>
  <label>Days</label><div class="days">${D.map((d, i) => `<label><input type="checkbox" data-day="${i}" ${(c.send_days || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div>
  <div class="row"><label>Max new emails per day (whole campaign)<input id="sLim" type="number" value="${c.daily_limit}"></label></div>
  <label class="chk"><input type="checkbox" id="sStop" ${c.stop_on_reply ? "checked" : ""}> Stop the sequence when a lead replies</label></div>
  <div class="panel"><h3>AI reply agent</h3><label class="chk"><input type="checkbox" id="sAi" ${c.ai_reply ? "checked" : ""}> Let the AI answer interested leads and questions for this campaign</label>
  <label>What you offer (the only facts the AI may use: service, price, proof, who it's for)<textarea id="sOffer" placeholder="We build websites for roofers. £10,000 build + £500/month. Live in 7 days.">${esc(c.ai_offer)}</textarea></label>
  <p class="small">The booking link comes from <a href="#settings" style="color:var(--brand)">Settings</a>.</p></div>
  <button class="btn btn-primary" id="saveSet">Save settings</button>`;
  $("#saveSet").onclick = async () => {
    const upd = { mailbox_ids: [...document.querySelectorAll("[data-mb]:checked")].map((x) => x.dataset.mb), timezone: $("#sTz").value.trim() || "UTC",
      send_start: $("#sFrom").value, send_end: $("#sTo").value, send_days: [...document.querySelectorAll("[data-day]:checked")].map((x) => +x.dataset.day),
      daily_limit: +$("#sLim").value || 500, stop_on_reply: $("#sStop").checked, ai_reply: $("#sAi").checked, ai_offer: $("#sOffer").value.trim() };
    const { error } = await sb.from("campaigns").update(upd).eq("id", c.id);
    toast(error ? error.message : "Settings saved");
  };
}

// ---------------------------------------------------------------- inbox
async function viewInbox(sel) {
  const { data: ms } = await sb.from("messages").select("*").eq("workspace_id", WS.id).eq("direction", "in").order("created_at", { ascending: false }).limit(100);
  $("#view").innerHTML = `<div class="head"><h1>Inbox</h1><span class="small">Replies from all your email accounts. Warm-up emails are hidden.</span></div>
  <div class="thread"><div class="mlist">${(ms || []).map((m) => `<div class="mitem" data-m="${m.id}"><b>${esc(m.from_email)}</b>
  <p>${m.classification ? `<span class="st ${m.classification}">${m.classification.replace("_", " ")}</span> ` : ""}${m.ai_status ? `<span class="st ${m.ai_status}">AI ${m.ai_status}</span> ` : ""}${esc(m.subject)}</p></div>`).join("") || `<p class="small" style="padding:16px">No replies yet.</p>`}</div>
  <div class="panel" id="mview"><p class="small">Pick a reply to read it.</p></div></div>`;
  document.querySelectorAll("[data-m]").forEach((el) => el.onclick = () => openMsg(ms.find((m) => m.id === el.dataset.m), el));
  if (sel) { const el = document.querySelector(`[data-m="${sel}"]`); if (el) el.click(); }
}
async function openMsg(m, el) {
  document.querySelectorAll(".mitem").forEach((x) => x.classList.toggle("on", x === el));
  const { data: thread } = await sb.from("messages").select("*").eq("lead_id", m.lead_id).order("created_at");
  $("#mview").innerHTML = `<h3>${esc(m.subject)}</h3><p class="small">${esc(m.from_email)} → ${esc(m.to_email)}</p>
  ${(thread || []).map((t) => `<div class="small" style="margin-top:12px"><b>${t.direction === "in" ? esc(t.from_email) : "You" + (t.classification === "ai_reply" ? " (AI)" : "")}</b> · ${new Date(t.created_at).toLocaleString()}</div><div class="body">${esc(t.body)}</div>`).join("")}
  <label>Reply${m.ai_status === "draft" ? " (AI draft, edit before sending)" : ""}<textarea id="rBody">${esc(m.ai_status === "draft" ? m.ai_draft || "" : "")}</textarea></label>
  <div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-primary" id="rSend">Send reply</button></div>`;
  $("#rSend").onclick = async () => { const body = $("#rBody").value.trim(); if (!body) return toast("Write a reply first.");
    $("#rSend").disabled = true; const r = await engine("send_reply", { message_id: m.id, body }); $("#rSend").disabled = false;
    toast(r.ok ? "Reply sent" : "Failed: " + (r.error || "")); if (r.ok) viewInbox(m.id); };
}

// ---------------------------------------------------------------- settings
async function viewSettings() {
  const { data: plans } = await sb.from("plans").select("*").order("sort");
  $("#view").innerHTML = `<div class="head"><h1>Settings</h1></div>
  <div class="panel"><h3>Workspace</h3><div class="row"><label>Name<input id="wName" value="${esc(WS.name)}"></label>
  <label>Booking link (the AI shares it with interested leads)<input id="wBook" value="${esc(WS.booking_link || "")}" placeholder="https://cal.com/you/30min"></label></div>
  <label class="chk"><input type="checkbox" id="wAi" ${WS.ai_reply_enabled ? "checked" : ""}> AI reply agent on</label>
  <button class="btn btn-primary" id="wSave" style="margin-top:14px">Save</button></div>
  <div class="panel"><h3>Plan</h3><p class="small">${planLine()}</p>
  ${WS.paypal_subscription_id && WS.billing_status !== "CANCELLED" && ["base", "pro", "scale"].includes(WS.plan) ? `<p class="small" style="margin-top:6px">Billed monthly through PayPal. <a href="#" id="bCancel" style="color:var(--bad)">Cancel subscription</a></p>` : ""}
  <div class="prices" style="margin-top:14px">${(plans || []).map((p) => `<div class="price${p.id === "pro" ? " hot" : ""}"><div class="name">${p.name}</div>
  <div class="amt" style="font-size:30px">${p.price_usd ? "$" + p.price_usd + "<small>/month</small>" : "Custom"}</div>
  <ul>${p.contacts_limit ? `<li>${p.contacts_limit.toLocaleString()} contacts</li><li>${p.emails_month_limit.toLocaleString()} emails / month</li>` : "<li>Custom volumes</li><li>Done-for-you setup</li>"}</ul>
  ${p.id === "enterprise" ? `<a class="btn btn-ghost" href="/enterprise/?plan=enterprise&ws=${WS.id}">Book a call</a>`
    : WS.plan === p.id && WS.billing_status !== "CANCELLED" ? `<span class="btn btn-ghost" style="cursor:default">Current plan</span>`
    : `<button class="paybtn btn ${p.id === "pro" ? "btn-primary" : "btn-ghost alt"}" data-sub="${p.id}">Choose ${p.name}</button>`}</div>`).join("")}</div>
  <p class="small" style="margin-top:12px">Secure checkout with PayPal (card or PayPal balance). Cancel any time; your plan stays on until the end of the month you paid for.</p></div>`;
  document.querySelectorAll("[data-sub]").forEach((bt) => bt.onclick = async () => {
    bt.disabled = true; bt.textContent = "Opening PayPal…";
    const r = await engine("billing_subscribe", { plan: bt.dataset.sub });
    if (r.approve) { location.href = r.approve; return; }
    bt.disabled = false; bt.textContent = "Try again"; toast("Couldn't start checkout: " + (r.error || "please try again"));
  });
  if ($("#bCancel")) $("#bCancel").onclick = async (e) => { e.preventDefault();
    if (!confirm("Cancel your subscription? Your plan stays on until the end of the month you paid for.")) return;
    const r = await engine("billing_cancel"); toast(r.ok ? "Subscription cancelled" : "Couldn't cancel: " + (r.error || "")); await reloadWS(); viewSettings(); };
  $("#wSave").onclick = async () => { const upd = { name: $("#wName").value.trim() || WS.name, booking_link: $("#wBook").value.trim() || null, ai_reply_enabled: $("#wAi").checked };
    const { error } = await sb.from("workspaces").update(upd).eq("id", WS.id); if (!error) Object.assign(WS, upd); toast(error ? error.message : "Saved"); };
}

sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") location.href = "/"; });
boot();
