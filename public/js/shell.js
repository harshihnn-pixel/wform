/* shell.js — sign in / create account, page layout, menu, notification bell, routing */
var VIEWS = {}, AFTER = {}, ACTIONS = {};
var NAV = [["dashboard", "Dashboard"], ["apply", "New application"], ["applications", "My applications"], ["calculator", "EMI calculator"], ["notifications", "Notifications"], ["profile", "Profile"]];
var TITLES = { dashboard: "Dashboard", apply: "Loan application", applications: "My applications", app: "Application", calculator: "EMI calculator", notifications: "Notifications", profile: "Profile" };
var ICONS = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  apply: "M12 5v14M5 12h14",
  applications: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  calculator: "M6 2h12v20H6zM9 6h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01M9 19h6",
  notifications: "M6 17V11a6 6 0 1 1 12 0v6l2 2H4zM10 21h4",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  logout: "M15 4h4v16h-4M10 16l4-4-4-4M14 12H3"
};
function icon(name) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>'; }
function unread() { return S.notifs.filter(function (n) { return !n.read; }).length; }

/* ---------------------------------------------------------- routing & rendering */
function go(route, params) {
  S.route = route; S.params = params || {};
  var sb = $(".sidebar"); if (sb) sb.classList.remove("open");
  closeBell();
  render();
  window.scrollTo(0, 0);
}
var renderTimer = null;
function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(function () {
    renderTimer = null;
    updateBell();
    if (isEditing()) { S.stale = true; return; }
    render();
  }, 0);
}
function isEditing() {
  if ($("#modal") || S.route === "apply") return true;
  var a = document.activeElement;
  return !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#view"));
}
function render() {
  S.stale = false;
  var root = $("#app");
  if (!S.ready) { root.innerHTML = '<div class="boot"><div class="logo-mark">' + esc(BRAND.short) + "</div><p>Loading…</p></div>"; return; }
  if (!S.me) { root.innerHTML = authView(); afterAuth(); return; }
  if (!VIEWS[S.route]) S.route = "dashboard";
  root.innerHTML = shell(VIEWS[S.route](S.params));
  updateBell();
  if (AFTER[S.route]) AFTER[S.route](S.params);
}
function shell(content) {
  var u = S.me, n = unread();
  var nav = NAV.map(function (x) {
    var active = S.route === x[0] || (S.route === "app" && x[0] === "applications");
    return '<button type="button" class="nav-item' + (active ? " active" : "") + '" data-go="' + x[0] + '"' + (active ? ' aria-current="page"' : "") + ">" + icon(x[0]) + "<span>" + x[1] + "</span>" +
      (x[0] === "notifications" && n ? '<span class="nav-count">' + n + "</span>" : "") + "</button>";
  }).join("");
  return '<div class="shell"><aside class="sidebar" aria-label="Main menu">' +
    '<div class="brand"><div class="logo-mark">' + esc(BRAND.short) + '</div><div><b>' + esc(BRAND.name) + "</b><small>" + esc(BRAND.tagline) + "</small></div></div>" +
    '<nav class="nav">' + nav + '</nav><div class="side-foot"><button type="button" class="nav-item" data-act="logout">' + icon("logout") + "<span>Sign out</span></button></div></aside>" +
    '<div class="scrim" data-act="menu" aria-hidden="true"></div>' +
    '<div class="main"><header class="topbar">' +
    '<button type="button" class="icon-btn menu-btn" data-act="menu" aria-label="Open menu"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>' +
    '<div class="crumbs">' + esc(TITLES[S.route] || "") + "</div>" +
    '<div class="top-actions">' +
    '<button type="button" class="icon-btn" id="theme-btn" data-act="theme" aria-label="' + (currentTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode") + '">' + themeIcon() + "</button>" +
    '<div class="bell-wrap"><button type="button" class="icon-btn bell" id="bell-btn" data-act="bell" aria-label="Notifications" aria-expanded="false" aria-controls="bell-panel">' + icon("notifications") + '<span id="bell-count" class="bell-count" hidden>0</span></button>' +
    '<div class="bell-panel" id="bell-panel" hidden></div></div>' +
    '<button type="button" class="user-chip" data-go="profile"><span class="avatar">' + esc(initials(u.name)) + '</span><span class="who"><b>' + esc(u.name) + "</b><small>" + esc(u.email) + "</small></span></button>" +
    "</div></header>" +
    '<main id="view" class="view">' + content + "</main></div></div>";
}
function updateBell() {
  var c = $("#bell-count"); if (!c) return;
  var n = unread(); c.textContent = n > 9 ? "9+" : n; c.hidden = !n;
  var p = $("#bell-panel"); if (p && !p.hidden) drawBell();
}
function drawBell() {
  var list = S.notifs.slice(0, 6);
  $("#bell-panel").innerHTML = '<div class="bell-head"><b>Notifications</b>' + (unread() ? '<button type="button" class="link" data-act="read-all">Mark all as read</button>' : "") + "</div>" +
    (list.length ? '<ul class="bell-list">' + list.map(function (n) {
      return '<li><button type="button" class="bell-item' + (n.read ? "" : " unread") + '" data-act="open-notif" data-id="' + n.id + '"><span>' + esc(n.text) + '</span><small>' + timeAgo(n.at) + "</small></button></li>";
    }).join("") + "</ul>" : '<p class="muted bell-empty">No notifications yet.</p>') +
    '<button type="button" class="bell-all" data-go="notifications">See all notifications</button>';
}
function closeBell() { var p = $("#bell-panel"); if (p) { p.hidden = true; var b = $("#bell-btn"); if (b) b.setAttribute("aria-expanded", "false"); } }

/* ---------------------------------------------------------- events */
document.addEventListener("click", function (e) {
  var g = e.target.closest("[data-go]");
  if (g && !g.closest("#modal")) {
    e.preventDefault();
    var p = {};
    ["id", "filter", "fresh"].forEach(function (k) { if (g.dataset[k]) p[k] = g.dataset[k]; });
    return go(g.dataset.go, p);
  }
  var a = e.target.closest("[data-act]");
  if (a && ACTIONS[a.dataset.act]) { e.preventDefault(); return ACTIONS[a.dataset.act](a, e); }
  if (!e.target.closest(".bell-wrap")) closeBell();
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeBell();
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-go]")) { e.preventDefault(); e.target.click(); }
});
ACTIONS.menu = function () { $(".sidebar").classList.toggle("open"); };
ACTIONS.theme = function () { setTheme(currentTheme() === "dark" ? "light" : "dark"); };
ACTIONS.bell = function (b) {
  var p = $("#bell-panel"), open = p.hidden;
  if (open) drawBell();
  p.hidden = !open; b.setAttribute("aria-expanded", String(open));
};
ACTIONS["read-all"] = function () { act(function () { return DB.readAll(); }, "All notifications marked as read."); };
ACTIONS["open-notif"] = async function (b) {
  var n = S.notifs.filter(function (x) { return x.id === b.dataset.id; })[0];
  if (!n) return;
  if (!n.read) { try { await DB.readOne(n.id); await refresh({ silent: true }); } catch (e) { /* not critical */ } }
  var a = n.appId && getApp(n.appId);
  if (a) go(a.status === "draft" ? "apply" : "app", { id: a.id }); else render();
};
ACTIONS.logout = async function () {
  try { await sb.auth.signOut(); } catch (e) { /* signed out locally anyway */ }
  S.me = null; S.apps = []; S.notifs = []; S.route = "login"; AUTH.mode = "login"; AUTH.note = null; render();
};

/* ---------------------------------------------------------- sign in / create account
   register → "check your email" → click link in email → back here with "Email confirmed"
   → sign in → dashboard. Unconfirmed accounts can't sign in. */
var AUTH = { mode: "register", email: "", note: null };   // note: { kind: "good"|"bad"|"info", text }
function authView() {
  var m = AUTH.mode;
  var panel =
    m === "check" ? checkEmailView() :
    m === "forgot" ? forgotView() :
    m === "reset" ? resetView() : formView(m === "register");
  return '<div class="auth">' +
    '<section class="auth-hero"><div class="brand big"><div class="logo-mark">' + esc(BRAND.short) + '</div><div><b>' + esc(BRAND.name) + "</b><small>" + esc(BRAND.tagline) + "</small></div></div>" +
    "<h1>Apply for your loan in six simple steps.</h1>" +
    '<ul class="hero-points"><li>Your application saves as you type. Finish it any time.</li><li>See every application and its reference number on one dashboard.</li><li>Check your EMI before you apply.</li></ul>' +
    '<button type="button" class="theme-float" data-act="theme" aria-label="Switch light or dark mode">' + themeIcon() + "</button></section>" +
    '<section class="auth-panel">' + panel + "</section></div>";
}
function noteHtml() { return AUTH.note ? '<div class="alert alert-' + AUTH.note.kind + '" role="status">' + AUTH.note.text + "</div>" : ""; }
function formView(reg) {
  return '<div class="auth-tabs" role="tablist">' +
    '<button type="button" role="tab" class="auth-tab' + (reg ? " active" : "") + '" aria-selected="' + reg + '" data-act="auth-mode" data-mode="register">Create account</button>' +
    '<button type="button" role="tab" class="auth-tab' + (!reg ? " active" : "") + '" aria-selected="' + !reg + '" data-act="auth-mode" data-mode="login">Sign in</button></div>' +
    '<form class="auth-form" id="auth-form" novalidate><h2>' + (reg ? "Create your account" : "Sign in") + '</h2><p class="muted">' + (reg ? "We'll email you a link to confirm your address." : "Use the email and password you registered with.") + "</p>" +
    noteHtml() +
    (reg ? field("au-name", "Full name", '<input id="au-name" type="text" autocomplete="name">', { req: 1 }) : "") +
    field("au-email", "Email", '<input id="au-email" type="email" autocomplete="email" value="' + esc(AUTH.email) + '">', { req: 1 }) +
    (reg ? field("au-phone", "Mobile number", '<input id="au-phone" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel">', { req: 1 }) : "") +
    field("au-pass", "Password", '<div class="pw-wrap"><input id="au-pass" type="password" autocomplete="' + (reg ? "new-password" : "current-password") + '"><button type="button" class="pw-toggle" data-act="pw-toggle" aria-label="Show password">Show</button></div>', { req: 1, hint: reg ? "At least 8 characters, with letters and numbers." : "" }) +
    '<p id="au-msg" class="form-error" role="alert"></p>' +
    '<button type="submit" class="btn btn-primary btn-block" id="au-submit">' + (reg ? "Create account" : "Sign in") + "</button>" +
    (reg ? '<p class="switch">Already have an account? <button type="button" class="link" data-act="auth-mode" data-mode="login">Sign in</button></p>'
      : '<p class="switch"><button type="button" class="link" data-act="auth-mode" data-mode="forgot">Forgot password?</button> · New here? <button type="button" class="link" data-act="auth-mode" data-mode="register">Create an account</button></p>') +
    "</form>";
}
function checkEmailView() {
  return '<div class="auth-form" id="check-email"><div class="mail-icon" aria-hidden="true">✉</div><h2>Confirm your email</h2>' +
    "<p>We sent a confirmation link to <b>" + esc(AUTH.email) + "</b>. Open it to activate your account, then come back and sign in.</p>" +
    noteHtml() +
    '<ul class="plain small muted"><li>The email can take a minute to arrive.</li><li>Check your spam or promotions folder.</li><li>The link works on any device.</li></ul>' +
    '<button type="button" class="btn btn-primary btn-block" data-act="auth-mode" data-mode="login">I\'ve confirmed. Sign in</button>' +
    '<button type="button" class="btn btn-ghost btn-block" data-act="resend" id="resend-btn">Resend confirmation email</button>' +
    '<p class="switch">Wrong email? <button type="button" class="link" data-act="auth-mode" data-mode="register">Create the account again</button></p></div>';
}
function forgotView() {
  return '<form class="auth-form" id="forgot-form" novalidate><h2>Reset your password</h2><p class="muted">Enter your email and we\'ll send you a link to set a new password.</p>' + noteHtml() +
    field("fp-email", "Email", '<input id="fp-email" type="email" autocomplete="email" value="' + esc(AUTH.email) + '">', { req: 1 }) +
    '<p id="fp-msg" class="form-error" role="alert"></p><button type="submit" class="btn btn-primary btn-block" id="fp-submit">Send reset link</button>' +
    '<p class="switch"><button type="button" class="link" data-act="auth-mode" data-mode="login">Back to sign in</button></p></form>';
}
function resetView() {
  return '<form class="auth-form" id="reset-form" novalidate><h2>Choose a new password</h2>' + noteHtml() +
    field("rp-pass", "New password", '<div class="pw-wrap"><input id="rp-pass" type="password" autocomplete="new-password"><button type="button" class="pw-toggle" data-act="pw-toggle" aria-label="Show password">Show</button></div>', { req: 1, hint: "At least 8 characters, with letters and numbers." }) +
    '<p id="rp-msg" class="form-error" role="alert"></p><button type="submit" class="btn btn-primary btn-block" id="rp-submit">Save new password</button></form>';
}
function pwProblem(pw) { return pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? "Use at least 8 characters, with letters and numbers." : ""; }

function afterAuth() {
  var f = $("#auth-form");
  if (f) f.addEventListener("submit", async function (e) {
    e.preventDefault();
    var reg = AUTH.mode === "register", msg = $("#au-msg"), btn = $("#au-submit");
    msg.textContent = "";
    var email = $("#au-email").value.trim().toLowerCase(), pw = $("#au-pass").value;
    var name = reg ? $("#au-name").value.trim() : "", phone = reg ? $("#au-phone").value.trim() : "";
    if (reg && name.length < 2) return (msg.textContent = "Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return (msg.textContent = "Enter a valid email address.");
    if (reg && !/^[6-9]\d{9}$/.test(phone)) return (msg.textContent = "Enter a 10-digit mobile number starting with 6–9.");
    if (reg && pwProblem(pw)) return (msg.textContent = pwProblem(pw));
    if (!pw) return (msg.textContent = "Enter your password.");
    AUTH.email = email;
    btn.disabled = true; btn.textContent = reg ? "Creating account…" : "Signing in…";
    try {
      if (reg) {
        var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { full_name: name, phone: phone }, emailRedirectTo: siteUrl() + "?confirmed=1" } });
        if (r.error) throw r.error;
        if (r.data && r.data.session) { await sb.auth.signOut(); }   // email confirmation is switched off in Supabase: still ask them to sign in
        AUTH.mode = "check"; AUTH.note = null; render();
        return;
      }
      var l = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (l.error) {
        if (/not confirmed/i.test(l.error.message || "")) {
          AUTH.mode = "check"; AUTH.note = { kind: "warn", text: "Your email isn't confirmed yet. Open the link we sent you, or resend it below." }; render(); return;
        }
        throw l.error;
      }
      AUTH.note = null;
      await enterApp();
      toast("Welcome, " + S.me.name.split(" ")[0] + ".");
    } catch (err) {
      msg.textContent = friendly(err);
      btn.disabled = false; btn.textContent = reg ? "Create account" : "Sign in";
    }
  });
  var fp = $("#forgot-form");
  if (fp) fp.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = $("#fp-email").value.trim().toLowerCase(), btn = $("#fp-submit");
    if (!/^\S+@\S+\.\S+$/.test(email)) return ($("#fp-msg").textContent = "Enter a valid email address.");
    btn.disabled = true; btn.textContent = "Sending…";
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() + "?reset=1" });
    if (r.error) { $("#fp-msg").textContent = friendly(r.error); btn.disabled = false; btn.textContent = "Send reset link"; return; }
    AUTH.email = email; AUTH.mode = "login";
    AUTH.note = { kind: "info", text: "If an account exists for " + esc(email) + ", a reset link is on its way. Open it <b>in this browser</b> to set a new password." };
    render();
  });
  var rp = $("#reset-form");
  if (rp) rp.addEventListener("submit", async function (e) {
    e.preventDefault();
    var pw = $("#rp-pass").value, btn = $("#rp-submit");
    if (pwProblem(pw)) return ($("#rp-msg").textContent = pwProblem(pw));
    btn.disabled = true; btn.textContent = "Saving…";
    var r = await sb.auth.updateUser({ password: pw });
    if (r.error) { $("#rp-msg").textContent = friendly(r.error); btn.disabled = false; btn.textContent = "Save new password"; return; }
    await sb.auth.signOut();
    AUTH.mode = "login"; AUTH.note = { kind: "good", text: "Password changed. Sign in with your new password." }; render();
  });
  var first = $(".auth-form input"); if (first && !first.value) first.focus();
}
ACTIONS["auth-mode"] = function (b) {
  var em = $("#au-email") || $("#fp-email"); if (em && em.value) AUTH.email = em.value.trim();
  AUTH.mode = b.dataset.mode; AUTH.note = null; render();
};
ACTIONS.resend = async function (b) {
  b.disabled = true; b.textContent = "Sending…";
  var r = await sb.auth.resend({ type: "signup", email: AUTH.email, options: { emailRedirectTo: siteUrl() + "?confirmed=1" } });
  AUTH.note = r.error ? { kind: "bad", text: esc(friendly(r.error)) } : { kind: "good", text: "A new confirmation email has been sent to " + esc(AUTH.email) + "." };
  render();
};
ACTIONS["pw-toggle"] = function (b) {
  var i = b.previousElementSibling, show = i.type === "password";
  i.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide password" : "Show password");
};
async function enterApp() {
  await refresh({ silent: true });
  S.route = "dashboard"; S.params = {};
  render();
  DB.remind().then(function () { return refresh({ silent: true }); }).then(updateBell).catch(function () {});
}

/* ---------------------------------------------------------- small builders */
function field(id, label, input, o) {
  o = o || {};
  return '<div class="field' + (o.full ? " full" : "") + '"><label for="' + id + '">' + esc(label) + (o.req ? ' <span class="req" aria-hidden="true">*</span>' : "") + "</label>" + input +
    (o.hint ? '<small class="hint">' + esc(o.hint) + "</small>" : "") + '<small class="field-err" id="' + id + '-err"></small></div>';
}
function selectHtml(id, options, value, placeholder) {
  return '<select id="' + id + '">' + (placeholder === false ? "" : '<option value="">' + esc(placeholder || "Select") + "</option>") + options.map(function (o) {
    var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return '<option value="' + esc(v) + '"' + (String(value) === String(v) ? " selected" : "") + ">" + esc(l) + "</option>";
  }).join("") + "</select>";
}
function pageHead(title, sub, actions) {
  return '<div class="page-head"><div><h1>' + esc(title) + "</h1>" + (sub ? '<p class="muted">' + sub + "</p>" : "") + "</div>" + (actions ? '<div class="head-actions">' + actions + "</div>" : "") + "</div>";
}
function empty(text, cta) { return '<div class="empty"><p>' + esc(text) + "</p>" + (cta || "") + "</div>"; }
