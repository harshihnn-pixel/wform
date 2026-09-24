/* banks.js — "Which banks can I apply to?"
   Compares an application with every lender's rules (from the 2024 policy sheet, stored in Supabase)
   and lets the Gemini assistant explain the result and answer questions. */
var BANK = { cache: {}, chat: {}, open: {}, filter: {} };
var RESULT = { eligible: ["Can apply", "good"], check: ["Check with bank", "warn"], not_eligible: ["Can't apply", "bad"] };
var BANK_DISCLAIMER = "Eligibility is indicative, based on the lenders' written 2024 personal-loan policies. The final decision, interest rate and loan amount are always the lender's.";

/* Placeholder that loads itself after the page is drawn. */
function bankPanel(a, opts) {
  opts = opts || {};
  return '<section class="card bank-card" id="bank-panel" data-app="' + a.id + '"' + (opts.compact ? ' data-compact="1"' : "") + '>' +
    '<div class="card-head"><div><span class="eyebrow">Bank eligibility</span><h3>Which banks can this application go to?</h3></div>' +
    '<button type="button" class="btn-sm" data-act="bank-refresh" data-id="' + a.id + '">Check again</button></div>' +
    '<div class="bank-body"><p class="muted">Comparing with lender policies…</p></div></section>';
}
async function mountBankPanel(force) {
  var el = $("#bank-panel"); if (!el) return;
  var id = el.dataset.app, a = getApp(id); if (!a) return;
  var key = id + "|" + a.updatedAt;
  try {
    if (force || !BANK.cache[key]) BANK.cache[key] = await DB.checkLenders(id);
    if (!$("#bank-panel") || $("#bank-panel").dataset.app !== id) return;
    el.querySelector(".bank-body").innerHTML = bankBody(a, BANK.cache[key], !!el.dataset.compact);
    Object.keys(BANK.open).forEach(function (k) { if (BANK.open[k] && k.indexOf(id + "|") === 0) fillPolicy(k.slice(id.length + 1)); });
  } catch (e) {
    el.querySelector(".bank-body").innerHTML = '<div class="alert alert-bad">' + esc(e.message || friendly(e)) + "</div>";
  }
}
function bankBody(a, rows, compact) {
  var groups = { eligible: [], check: [], not_eligible: [] };
  rows.forEach(function (r) { (groups[r.result] || groups.check).push(r); });
  var tab = BANK.filter[a.id] || (groups.eligible.length ? "eligible" : groups.check.length ? "check" : "not_eligible");
  var list = groups[tab];
  var html = '<div class="bank-tabs" role="tablist">' + ["eligible", "check", "not_eligible"].map(function (k) {
      return '<button type="button" role="tab" aria-selected="' + (tab === k) + '" class="bank-tab tone-' + RESULT[k][1] + (tab === k ? " active" : "") + '" data-act="bank-tab" data-id="' + a.id + '" data-tab="' + k + '"><b class="num">' + groups[k].length + "</b><span>" + RESULT[k][0] + "</span></button>";
    }).join("") + "</div>";
  var missing = [];
  var w = a.data.work || {}, l = a.data.loan || {};
  if (!w.companyType) missing.push("employer type"); if (!w.payroll) missing.push("payroll type"); if (!l.cibil) missing.push("CIBIL score");
  var fixStep = !w.companyType || !w.payroll ? "work" : "loan";
  if (missing.length && a.status === "draft") html += '<div class="alert alert-info">Add your ' + missing.join(", ") + ' for a more accurate result. ' +
    (S.route === "apply" ? '<button type="button" class="link" data-act="step" data-step="' + fixStep + '">Add now</button>' : '<button type="button" class="link" data-go="apply" data-id="' + a.id + '">Add now</button>') + "</div>";
  else if (missing.length) html += '<div class="alert alert-info">Not given: ' + missing.join(", ") + ". Some banks are marked “check” because of this.</div>";
  html += list.length ? '<ul class="bank-list">' + list.slice(0, compact ? 6 : 50).map(function (r) { return bankRow(a, r); }).join("") + "</ul>" +
      (compact && list.length > 6 ? '<p class="small muted">' + (list.length - 6) + ' more. See all on the application page after saving.</p>' : "")
    : '<p class="muted empty-line">No lenders in this group.</p>';
  html += '<p class="disclaimer">' + esc(BANK_DISCLAIMER) + "</p>";
  html += aiBox(a);
  return html;
}
function bankRow(a, r) {
  var key = a.id + "|" + r.lender_id, open = !!BANK.open[key];
  var roi = r.roi_min != null ? r.roi_min + (r.roi_max != null ? "–" + r.roi_max : "+") + "%" : "Not stated";
  var reasons = (r.reasons_fail || []).map(function (x) { return '<li class="rs-bad">' + esc(x) + "</li>"; }).join("") +
    (r.reasons_check || []).map(function (x) { return '<li class="rs-warn">' + esc(x) + "</li>"; }).join("") +
    (r.reasons_ok || []).map(function (x) { return '<li class="rs-ok">' + esc(x) + "</li>"; }).join("");
  return '<li class="bank-row"><div class="bank-top"><div class="bank-name"><span class="bank-logo" aria-hidden="true">' + esc(initials(r.bank_name)) + '</span><div><b>' + esc(r.bank_name) + "</b>" + (r.variant ? '<small class="muted"> · ' + esc(r.variant) + "</small>" : "") + "<div>" + badge(RESULT[r.result][0], RESULT[r.result][1]) + "</div></div></div>" +
    '<dl class="bank-facts"><div><dt>Interest from</dt><dd class="num">' + esc(roi) + '</dd></div><div><dt>Eligible up to</dt><dd class="num">' + (r.eligible_amount != null ? inrShort(r.eligible_amount) : "—") + '</dd></div><div><dt>Est. EMI</dt><dd class="num">' + (r.est_emi ? inr(r.est_emi) : "—") + "</dd></div></dl></div>" +
    (reasons ? '<ul class="reasons">' + reasons + "</ul>" : "") +
    '<button type="button" class="link small" data-act="bank-policy" data-id="' + a.id + '" data-lender="' + esc(r.lender_id) + '" aria-expanded="' + open + '">' + (open ? "Hide" : "Show") + " policy notes</button>" +
    (open ? '<div class="policy-notes" id="pol-' + esc(r.lender_id) + '"><p class="muted small">Loading…</p></div>' : "") + "</li>";
}
async function fillPolicy(lenderId) {
  var box = document.getElementById("pol-" + lenderId); if (!box) return;
  try {
    var p = BANK.cache["pol|" + lenderId] || (BANK.cache["pol|" + lenderId] = await DB.lenderPolicy(lenderId));
    var keys = Object.keys(p).sort();
    box.innerHTML = keys.length ? '<dl class="kv small">' + keys.map(function (k) { return "<dt>" + esc(k.replace(/^\d+\.\s*/, "")) + "</dt><dd>" + esc(p[k]) + "</dd>"; }).join("") + "</dl>" : '<p class="muted small">No notes recorded.</p>';
  } catch (e) { box.innerHTML = '<p class="form-error">' + esc(e.message) + "</p>"; }
}
ACTIONS["bank-refresh"] = function () { mountBankPanel(true); };
ACTIONS["bank-tab"] = function (b) { BANK.filter[b.dataset.id] = b.dataset.tab; mountBankPanel(false); };
ACTIONS["bank-policy"] = function (b) {
  var k = b.dataset.id + "|" + b.dataset.lender; BANK.open[k] = !BANK.open[k];
  mountBankPanel(false);
};

/* ---------------------------------------------------------- Gemini assistant */
function aiBox(a) {
  var r = a.ai, chat = BANK.chat[a.id] || [];
  var html = '<div class="ai-box" id="ai-box"><div class="ai-head"><span class="ai-mark" aria-hidden="true">✦</span><div><b>AI assistant</b><small class="muted">Powered by Google Gemini. Explains your results and answers questions.</small></div>' +
    '<button type="button" class="btn btn-primary btn-small" data-act="ai-analyse" data-id="' + a.id + '" id="ai-go">' + (r ? "Explain again" : "Explain my results") + "</button></div>";
  if (r) {
    html += '<div class="ai-result"><p class="ai-summary">' + esc(r.summary) + "</p>" +
      (r.best_options && r.best_options.length ? "<h4>Best options</h4><ol class=\"ai-list\">" + r.best_options.map(function (o) { return "<li><b>" + esc(o.lender) + "</b> " + esc(o.why) + "</li>"; }).join("") + "</ol>" : "") +
      (r.watch_outs && r.watch_outs.length ? "<h4>Keep in mind</h4><ul class=\"ai-list\">" + r.watch_outs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (r.improve && r.improve.length ? "<h4>How to qualify for more banks</h4><ul class=\"ai-list\">" + r.improve.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      (r.documents && r.documents.length ? "<h4>Documents to keep ready</h4><div class=\"chip-row\">" + r.documents.map(function (x) { return '<span class="doc-chip">' + esc(x) + "</span>"; }).join("") + "</div>" : "") +
      '<p class="small muted">Generated ' + timeAgo(r.generated_at) + ". " + esc(r.disclaimer || "") + "</p></div>";
  }
  html += '<div class="ai-chat">' + (chat.length ? '<ol class="chat-log">' + chat.map(function (m) {
      return '<li class="msg msg-' + (m.role === "assistant" ? "ai" : "me") + '">' + (m.pending ? '<span class="typing" aria-label="Thinking">…</span>' : esc(m.content).replace(/\n/g, "<br>")) + "</li>";
    }).join("") + "</ol>" : '<div class="chat-hints">' + ["Which bank is best for me?", "Why can't I apply to some banks?", "What can I do to get a lower interest rate?"].map(function (q) {
      return '<button type="button" class="chip" data-act="ai-hint" data-id="' + a.id + '">' + esc(q) + "</button>";
    }).join("") + "</div>") +
    '<form class="chat-form" data-app="' + a.id + '"><label for="ai-q" class="sr-only">Ask the AI assistant</label><input id="ai-q" type="text" maxlength="500" placeholder="Ask about your bank options…" autocomplete="off"><button type="submit" class="btn btn-ghost">Ask</button></form></div></div>';
  return html;
}
ACTIONS["ai-analyse"] = async function (b) {
  b.disabled = true; b.textContent = "Analysing…";
  try {
    var r = await DB.advisor(b.dataset.id, "analyse");
    var a = getApp(b.dataset.id); if (a) a.ai = r;
    mountBankPanel(false);
  } catch (e) { toast(e.message, "error"); b.disabled = false; b.textContent = "Explain my results"; }
};
ACTIONS["ai-hint"] = function (b) { askAi(b.dataset.id, b.textContent); };
document.addEventListener("submit", function (e) {
  var f = e.target.closest && e.target.closest(".chat-form"); if (!f) return;
  e.preventDefault();
  var q = f.querySelector("input").value.trim(); if (!q) return;
  askAi(f.dataset.app, q);
});
async function askAi(id, q) {
  var chat = BANK.chat[id] = (BANK.chat[id] || []).filter(function (m) { return !m.pending; });
  chat.push({ role: "user", content: q }, { role: "assistant", content: "", pending: true });
  await mountBankPanel(false);
  try {
    var r = await DB.advisor(id, "chat", chat.filter(function (m) { return !m.pending; }).map(function (m) { return { role: m.role, content: m.content }; }));
    chat[chat.length - 1] = { role: "assistant", content: r.reply };
  } catch (e) {
    chat.pop(); chat.pop(); toast(e.message, "error");
  }
  await mountBankPanel(false);
  var log = $(".chat-log"); if (log) log.scrollTop = log.scrollHeight;
  var inp = $("#ai-q"); if (inp) inp.focus();
}

/* ---------------------------------------------------------- "Bank eligibility" page */
TITLES.banks = "Bank eligibility";
NAV.splice(3, 0, ["banks", "Bank eligibility"]);
ICONS.banks = "M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6";
VIEWS.banks = function (p) {
  var apps = sortedApps().filter(function (a) { return a.status !== "withdrawn"; });
  if (!apps.length) return pageHead("Bank eligibility", "See which banks you can apply to.") + '<section class="card">' + empty("Start an application first. Once the work and loan details are filled in, you'll see which banks fit.", '<button type="button" class="btn btn-primary" data-go="apply" data-fresh="1">Start application</button>') + "</section>";
  var id = p.id && getApp(p.id) ? p.id : apps[0].id, a = getApp(id);
  S.params = { id: id };
  return pageHead("Bank eligibility", "Your details compared with " + "the lending rules of 26 bank and NBFC policies.") +
    '<div class="filters"><label for="bk-app" class="small muted">Application</label>' + selectHtml("bk-app", apps.map(function (x) { return [x.id, x.ref + " · " + (field_(x, "loan", "loanType") || "Loan") + (appAmount(x) ? " · " + inrShort(appAmount(x)) : "") + (x.status === "draft" ? " (incomplete)" : "")]; }), id, false) + "</div>" +
    bankPanel(a);
};
AFTER.banks = function () {
  $("#bk-app").onchange = function (e) { go("banks", { id: e.target.value }); };
  mountBankPanel(false);
};
