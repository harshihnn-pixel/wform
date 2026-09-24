/* main.js — start-up.
   Handles the links in emails:
     ?confirmed=1   the person clicked "Confirm your email" → show sign-in with a success message
     ?reset=1&code  the person clicked "Reset password"     → let them choose a new password
   then shows the dashboard if already signed in, or the sign-in page. */
ACTIONS.reload = function () { location.reload(); };

function readLinkParams() {
  var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""));
  function g(k) { return q.get(k) || h.get(k); }
  return { confirmed: g("confirmed"), reset: g("reset"), code: q.get("code"), error: g("error_description") || g("error"), errorCode: g("error_code") };
}
function cleanUrl() { history.replaceState(null, "", location.pathname); }

(async function init() {
  render();
  if (!configured()) {
    S.ready = true;
    document.getElementById("app").innerHTML = '<div class="boot"><div class="logo-mark">' + esc(BRAND.short) + '</div><h2>Connect Supabase</h2><p class="muted">Add your Supabase Project URL and publishable (anon) key in <b>public/js/config.js</b>, then reload. See README.md.</p></div>';
    return;
  }
  var link = readLinkParams();
  if (link.confirmed || link.reset || link.code || link.error) cleanUrl();

  if (link.error) {
    var expired = /expired|invalid/i.test(link.error) || link.errorCode === "otp_expired";
    AUTH.mode = link.reset ? "forgot" : "login";
    AUTH.note = { kind: "bad", text: expired ? (link.reset ? "That reset link has expired or was already used. Ask for a new one below." : "That confirmation link has expired or was already used. Sign in; if your email still isn't confirmed you can resend the link.") : esc(link.error) };
  } else if (link.reset && link.code) {
    var ex = await sb.auth.exchangeCodeForSession(link.code);
    if (ex.error) {
      AUTH.mode = "forgot";
      AUTH.note = { kind: "bad", text: "Open the reset link in the same browser where you asked for it, or ask for a new link below." };
    } else {
      AUTH.mode = "reset"; AUTH.note = null;
      S.ready = true; S.me = null; render();
      return;
    }
  } else if (link.confirmed) {
    await sb.auth.signOut({ scope: "local" }).catch(function () {});
    AUTH.mode = "login";
    AUTH.note = { kind: "good", text: "<b>Email confirmed.</b> Your account is active. Sign in to continue." };
  }

  var sess = null;
  if (AUTH.mode !== "reset" && !link.confirmed && !link.error) {
    try { sess = (await sb.auth.getSession()).data.session; } catch (e) { sess = null; }
  }
  S.ready = true;
  if (sess) {
    try { await enterApp(); }
    catch (e) {
      if (e.code === "no_session") { S.me = null; render(); }
      else document.getElementById("app").innerHTML = '<div class="boot"><div class="logo-mark">' + esc(BRAND.short) + "</div><p>" + esc(e.message || friendly(e)) + '</p><button type="button" class="btn btn-primary" data-act="reload">Try again</button></div>';
    }
  } else {
    S.me = null; render();
  }

  sb.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT" && S.me) { S.me = null; S.apps = []; S.notifs = []; AUTH.mode = "login"; render(); }
  });
  // Pick up new notifications every 30 seconds while the page is open.
  setInterval(function () {
    if (S.me && document.visibilityState === "visible") refresh().catch(function () {});
  }, 30000);
})();
