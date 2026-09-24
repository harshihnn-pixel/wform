/* core.js — Supabase connection, data loading, theme, dialogs and formatting helpers */
"use strict";
var STATUS = Shared.STATUS, STEPS = Shared.STEPS, DOC_TYPES = Shared.DOC_TYPES;
var BUCKET = "application-documents";
var S = { ready: false, me: null, apps: [], notifs: [], route: "login", params: {}, stale: false };

/* ---------------------------------------------------------- Supabase client */
var sb = null;
function configured() {
  return !!(window.supabase && window.SUPABASE_URL && /^https?:\/\//.test(window.SUPABASE_URL) && window.SUPABASE_ANON_KEY && !/YOUR-/.test(window.SUPABASE_URL));
}
if (configured()) {
  sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    // detectSessionInUrl is off on purpose: clicking the email link only confirms the
    // address; the person then signs in with their password (works on any device).
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
}
function siteUrl() { return (window.SITE_URL || (location.origin + location.pathname)).replace(/[?#].*$/, ""); }

function ApiError(message, code) { this.message = message; this.code = code; }
/* Turn Supabase / network errors into plain sentences. */
function friendly(err) {
  var m = (err && (err.message || err.msg || err.error_description)) || String(err || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Can't reach the server. Check your internet connection and try again.";
  if (/Invalid login credentials/i.test(m)) return "Email or password is incorrect.";
  if (/Email not confirmed/i.test(m)) return "Please confirm your email first. Open the link we sent to your inbox.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/Password should be/i.test(m)) return "Use at least 8 characters, with letters and numbers.";
  if (/same.*password|different from the old/i.test(m)) return "Choose a password different from your current one.";
  if (/JWT expired|refresh token/i.test(m)) return "Your session has ended. Please sign in again.";
  if (/row-level security|permission denied/i.test(m)) return "You don't have access to this.";
  if (/mime type|not supported/i.test(m)) return "Upload a PDF, JPG or PNG file.";
  if (/exceeded the maximum allowed size|Payload too large/i.test(m)) return "Files can be up to 5 MB.";
  return m || "Something went wrong. Try again.";
}
function check(res) {
  if (res.error) {
    var e = res.error;
    if (/JWT|refresh token/i.test(e.message || "") && S.me) { S.me = null; S.route = "login"; render(); }
    throw new ApiError(friendly(e), e.code);
  }
  return res.data;
}
async function userId() {
  var r = await sb.auth.getSession();
  var s = r.data && r.data.session;
  if (!s) throw new ApiError("Your session has ended. Please sign in again.", "no_session");
  return s.user.id;
}

/* ---------------------------------------------------------- loading data */
function toApp(r) {
  var a = { id: r.id, ref: r.ref, status: r.status, step: r.step, data: r.data || {}, documents: r.documents || {}, history: r.history || [],
    createdAt: r.created_at, updatedAt: r.updated_at, submittedAt: r.submitted_at, ai: r.ai_analysis || null };
  a.completion = Shared.completion(a);
  return a;
}
async function refresh(opts) {
  var uid = await userId();
  var res = await Promise.all([
    sb.from("profiles").select("id, full_name, email, phone, created_at").eq("id", uid).maybeSingle(),
    sb.from("applications").select("id, ref, status, step, data, documents, history, created_at, updated_at, submitted_at, ai_analysis").order("updated_at", { ascending: false }),
    sb.from("notifications").select("id, text, app_id, read, created_at").order("created_at", { ascending: false }).limit(100)
  ]);
  var p = check(res[0]) || {};
  var sess = (await sb.auth.getSession()).data.session;
  S.me = { id: uid, name: p.full_name || (sess.user.user_metadata || {}).full_name || sess.user.email, email: p.email || sess.user.email, phone: p.phone || "" };
  S.apps = (check(res[1]) || []).map(toApp);
  S.notifs = (check(res[2]) || []).map(function (n) { return { id: n.id, text: n.text, appId: n.app_id, read: n.read, at: n.created_at }; });
  if (!(opts && opts.silent)) scheduleRender();
  return S;
}
function putApp(row) { var a = toApp(row); S.apps = S.apps.filter(function (x) { return x.id !== a.id; }).concat([a]); return a; }
async function act(fn, okMsg) {
  try { var r = await fn(); await refresh(); if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg); return r; }
  catch (e) { toast(e.message || friendly(e), "error"); return null; }
}
function getApp(id) { return S.apps.filter(function (a) { return a.id === id; })[0]; }
function sortedApps() { return S.apps.slice().sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); }); }
function field_(a, step, key) { return ((a.data || {})[step] || {})[key]; }
function appName(a) { return field_(a, "personal", "name") || "Applicant name not added"; }
function appLoan(a) { return field_(a, "loan", "loanType") || "Loan type not chosen"; }
function appAmount(a) { return Number(field_(a, "loan", "amount")) || 0; }

/* ---------------------------------------------------------- data operations */
var COLS = "id, ref, status, step, data, documents, history, created_at, updated_at, submitted_at, ai_analysis";
var DB = {
  createApp: async function (step, data) {
    var body = { step: step, data: {} };
    body.data[step] = cleanSection(step, data);
    return putApp(check(await sb.from("applications").insert(body).select(COLS).single()));
  },
  saveSection: async function (id, step, data) {
    // The database merges this step atomically (save_application_step), so saves never overwrite each other.
    var rows = check(await sb.rpc("save_application_step", { p_id: id, p_step: step, p_data: cleanSection(step, data) }));
    var row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new ApiError("This application can't be edited any more.");
    return putApp(row);
  },
  setStep: function (id, step) { return sb.from("applications").update({ step: step }).eq("id", id).then(function () {}); },
  submit: async function (id) { return putApp(check(await sb.from("applications").update({ status: "submitted" }).eq("id", id).select(COLS).single())); },
  setStatus: async function (id, status, note) { return putApp(check(await sb.from("applications").update({ status: status, status_note: note || null }).eq("id", id).select(COLS).single())); },
  deleteApp: async function (id) {
    var a = getApp(id);
    var paths = Object.keys(a.documents || {}).map(function (t) { return a.documents[t].path; }).filter(Boolean);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    check(await sb.from("applications").delete().eq("id", id));
  },
  uploadDoc: async function (id, type, file) {
    var uid = await userId(), a = getApp(id);
    var ext = (/\.(pdf|jpe?g|png)$/i.exec(file.name) || [".pdf"])[0].toLowerCase();
    var path = uid + "/" + id + "/" + type + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + ext;
    check(await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }));
    var docs = Object.assign({}, a.documents), prev = docs[type];
    docs[type] = { type: type, fileName: file.name.slice(0, 120), size: file.size, mime: file.type, at: new Date().toISOString(), path: path };
    var row = check(await sb.from("applications").update({ documents: docs }).eq("id", id).select(COLS).single());
    if (prev && prev.path) sb.storage.from(BUCKET).remove([prev.path]).catch(function () {});
    return putApp(row);
  },
  removeDoc: async function (id, type) {
    var a = getApp(id), docs = Object.assign({}, a.documents), d = docs[type];
    delete docs[type];
    var row = check(await sb.from("applications").update({ documents: docs }).eq("id", id).select(COLS).single());
    if (d && d.path) await sb.storage.from(BUCKET).remove([d.path]);
    return putApp(row);
  },
  docUrl: async function (id, type) {
    var d = (getApp(id).documents || {})[type];
    var r = check(await sb.storage.from(BUCKET).createSignedUrl(d.path, 60));
    return r.signedUrl;
  },
  readAll: async function () { check(await sb.from("notifications").update({ read: true }).eq("read", false)); },
  readOne: async function (id) { check(await sb.from("notifications").update({ read: true }).eq("id", id)); },
  clearNotifs: async function () { check(await sb.from("notifications").delete().not("id", "is", null)); },
  saveProfile: async function (name, phone) { var uid = await userId(); check(await sb.from("profiles").update({ full_name: name, phone: phone }).eq("id", uid)); },
  changePassword: async function (current, next) {
    var chk = await sb.auth.signInWithPassword({ email: S.me.email, password: current });
    if (chk.error) throw new ApiError("Your current password is incorrect.");
    check(await sb.auth.updateUser({ password: next }));
  },
  /* Bank eligibility: compares the application with every lender's rules (database function check_lenders). */
  checkLenders: async function (id) { return check(await sb.rpc("check_lenders", { p_application: id })) || []; },
  lenderPolicy: async function (lenderId) { return (check(await sb.from("lenders").select("id, bank_name, variant, policy").eq("id", lenderId).maybeSingle()) || {}).policy || {}; },
  /* Gemini assistant (Edge Function "bank-advisor"). mode: "analyse" or "chat". */
  advisor: async function (id, mode, messages) {
    var r;
    try { r = await sb.functions.invoke("bank-advisor", { body: { application_id: id, mode: mode, messages: messages || [] } }); }
    catch (e) { throw new ApiError(friendly(e)); }
    if (r.error) {
      var msg = r.error.message || "";
      try { var ctx = r.error.context; if (ctx && typeof ctx.json === "function") { var j = await ctx.json(); if (j && j.error) msg = j.error; } } catch (e) { /* keep message */ }
      if (/Failed to send|fetch/i.test(msg)) msg = "The AI assistant isn't reachable. Check that the bank-advisor function is deployed.";
      throw new ApiError(msg || "The AI assistant couldn't answer. Try again.");
    }
    return r.data;
  },
  remind: function () { return sb.rpc("remind_incomplete").then(function () {}, function () {}); }
};
/* Only fields defined in the form are sent. */
function cleanSection(step, data) {
  var def = STEPS.filter(function (s) { return s.id === step; })[0], out = {};
  (def ? def.fields : []).forEach(function (f) { if (data && f[0] in data) out[f[0]] = String(data[f[0]] == null ? "" : data[f[0]]).trim().slice(0, f[0] === "address" ? 500 : 200); });
  if (out.pan) out.pan = out.pan.toUpperCase();
  return out;
}

/* ---------------------------------------------------------- theme */
var THEME_KEY = "loan-portal-theme";
function savedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } }
function currentTheme() {
  var t = document.documentElement.getAttribute("data-theme");
  if (t) return t;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* not saved: fine */ }
  var b = document.getElementById("theme-btn");
  if (b) { b.innerHTML = themeIcon(); b.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode"); }
}
(function () { var t = savedTheme(); if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t); })();
function themeIcon() {
  return currentTheme() === "dark"
    ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
}

/* ---------------------------------------------------------- DOM helpers */
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function toast(msg, kind) {
  var host = $("#toasts"); if (!host) return;
  var t = document.createElement("div");
  t.className = "toast" + (kind ? " toast-" + kind : "");
  t.setAttribute("role", kind === "error" ? "alert" : "status");
  t.textContent = msg;
  host.appendChild(t);
  while (host.children.length > 3) host.removeChild(host.firstChild);
  setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 300); }, kind === "error" ? 5000 : 3000);
}
function modal(o) {
  closeModal();
  var wrap = document.createElement("div");
  wrap.className = "modal-backdrop"; wrap.id = "modal";
  wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h3 id="modal-title">' + esc(o.title) + '</h3><button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>' +
    '<div class="modal-body">' + o.body + '</div><p class="form-error modal-msg" id="modal-msg"></p><div class="modal-foot">' +
    (o.actions || [{ label: "Close" }]).map(function (a, i) { return '<button type="button" class="btn ' + (a.kind ? "btn-" + a.kind : "btn-ghost") + '" data-mi="' + i + '">' + esc(a.label) + "</button>"; }).join("") + "</div></div>";
  document.body.appendChild(wrap);
  function close() { wrap.remove(); if (S.stale) render(); }
  wrap.addEventListener("click", function (e) {
    if (e.target === wrap || e.target.closest("[data-close]")) return close();
    var b = e.target.closest("[data-mi]"); if (!b) return;
    var a = (o.actions || [])[+b.dataset.mi];
    if (a && a.onClick) a.onClick(close, wrap); else close();
  });
  wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  var f = wrap.querySelector("input, select, textarea, .btn-primary"); if (f) f.focus();
}
function closeModal() { var m = $("#modal"); if (m) m.remove(); }
function modalError(msg) { var m = $("#modal-msg"); if (m) m.textContent = msg || ""; }
function confirmBox(title, text, okLabel, kind) {
  return new Promise(function (resolve) {
    modal({ title: title, body: "<p>" + esc(text) + "</p>", actions: [
      { label: "Cancel", onClick: function (c) { c(); resolve(false); } },
      { label: okLabel || "Confirm", kind: kind || "primary", onClick: function (c) { c(); resolve(true); } }] });
  });
}

/* ---------------------------------------------------------- formatting */
function inr(n) { n = Number(n); return isFinite(n) ? "₹" + Math.round(n).toLocaleString("en-IN") : "—"; }
function inrShort(n) {
  n = Number(n) || 0;
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.?0+$/, "") + " L";
  return inr(n);
}
function fmtDate(iso) { if (!iso) return "—"; var d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function fmtDateTime(iso) { if (!iso) return "—"; var d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function timeAgo(iso) {
  var s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + " d ago";
  return fmtDate(iso);
}
function badge(label, tone) { return '<span class="badge tone-' + tone + '">' + esc(label) + "</span>"; }
function statusBadge(s) { var d = STATUS[s] || [s, "neutral"]; return badge(d[0], d[1]); }
function initials(name) { return String(name || "?").split(/\s+/).filter(Boolean).map(function (p) { return p[0]; }).slice(0, 2).join("").toUpperCase(); }
function progressBar(pct, label) {
  return '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"' + (label ? ' aria-label="' + esc(label) + '"' : "") + '><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></div>';
}
