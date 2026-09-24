/* pages.js — dashboard, application form, applications list & detail,
   EMI calculator, notifications and profile */

/* ============================================================ dashboard */
VIEWS.dashboard = function () {
  var apps = sortedApps();
  var drafts = apps.filter(function (a) { return a.status === "draft"; });
  var done = apps.filter(function (a) { return a.status !== "draft"; });
  var sanctioned = apps.filter(function (a) { return a.status === "sanctioned" || a.status === "disbursed"; });
  var applied = done.reduce(function (t, a) { return t + appAmount(a); }, 0);
  var first = S.me.name.split(" ")[0];
  var html = pageHead("Hello, " + first, apps.length ? "Here's a summary of your loan applications." : "Welcome. Start your first loan application below.",
    '<button type="button" class="btn btn-primary" data-go="apply" data-fresh="1">' + icon("apply") + "New application</button>");

  html += '<div class="stats">' +
    statCard(apps.length, "Total applications", "", "applications", "") +
    statCard(done.length, "Completed", "Submitted to us", "applications", "submitted") +
    statCard(drafts.length, "Incomplete", drafts.length ? "Waiting to be finished" : "Nothing pending", "applications", "draft", drafts.length ? "warn" : "") +
    statCard(inrShort(applied), "Amount applied for", sanctioned.length ? sanctioned.length + " sanctioned" : "Across completed applications", "applications", "") + "</div>";

  if (!apps.length) {
    html += '<section class="card start-card"><div><h2>Start your loan application</h2><p class="muted">Six short steps: personal details, address, work and income, loan details, documents, and a final review. Your answers save automatically, so you can stop and continue later.</p></div>' +
      '<ol class="step-preview">' + STEPS.map(function (s, i) { return "<li><span>" + (i + 1) + "</span>" + esc(s.title) + "</li>"; }).join("") + "</ol>" +
      '<button type="button" class="btn btn-primary" data-go="apply" data-fresh="1">Start application</button></section>';
  }
  if (drafts.length) {
    html += '<section class="card"><div class="card-head"><h3>Incomplete applications</h3><small class="muted">Finish these to submit them</small></div><ul class="draft-list">' +
      drafts.map(function (a) {
        return '<li class="draft"><div class="draft-main"><div class="row gap wrap"><b class="mono">' + esc(a.ref) + "</b>" + statusBadge("draft") + '</div><span class="muted small">' + esc(appLoan(a)) + (appAmount(a) ? " · " + inr(appAmount(a)) : "") + " · saved " + timeAgo(a.updatedAt) + "</span></div>" +
          '<div class="draft-progress"><span class="num"><b>' + a.completion + "%</b> complete</span>" + progressBar(a.completion, a.ref + " completion") + "</div>" +
          '<button type="button" class="btn btn-accent" data-go="apply" data-id="' + a.id + '">Continue</button></li>';
      }).join("") + "</ul></section>";
  }
  if (apps.length) {
    var latest = apps[0];
    html += '<section class="card bank-cta"><div><span class="eyebrow">Bank eligibility</span><h3>See which banks you can apply to</h3><p class="muted">Your details are compared with 26 bank and NBFC lending policies, and the AI assistant explains the result.</p></div>' +
      '<button type="button" class="btn btn-primary" data-go="banks" data-id="' + latest.id + '">Check banks for ' + esc(latest.ref) + "</button></section>";
  }
  html += '<div class="dash-grid"><section class="card"><div class="card-head"><h3>Recent applications</h3>' + (apps.length ? '<button type="button" class="link" data-go="applications">View all</button>' : "") + "</div>" +
    (apps.length ? appTable(apps.slice(0, 6)) : empty("Your applications and their reference numbers will appear here.")) + "</section>" +
    '<section class="card"><div class="card-head"><h3>Quick EMI check</h3><button type="button" class="link" data-go="calculator">Full calculator</button></div>' +
    '<div class="form-grid one">' + field("q-amt", "Loan amount (₹)", '<input id="q-amt" type="number" min="0" step="10000" value="1000000">') +
    '<div class="form-grid">' + field("q-rate", "Interest (% a year)", '<input id="q-rate" type="number" step="0.05" value="10.5">') + field("q-yrs", "Years", '<input id="q-yrs" type="number" min="1" max="30" value="5">') + "</div></div>" +
    '<div class="quick-emi" id="q-out"></div></section></div>';
  if (done.length) {
    html += '<section class="card"><div class="card-head"><h3>Where your submitted applications are</h3></div><div class="status-strip">' +
      ["submitted", "with_bank", "sanctioned", "disbursed", "rejected", "withdrawn"].map(function (s) {
        var n = done.filter(function (a) { return a.status === s; }).length;
        return '<button type="button" class="strip-item tone-' + STATUS[s][1] + '" data-go="applications" data-filter="' + s + '"><b class="num">' + n + "</b><span>" + STATUS[s][0] + "</span></button>";
      }).join("") + "</div></section>";
  }
  return html;
};
AFTER.dashboard = function () {
  function upd() {
    var e = Shared.emi(+$("#q-amt").value, +$("#q-rate").value, Math.round(+$("#q-yrs").value * 12));
    $("#q-out").innerHTML = '<span class="mini-label">Monthly EMI</span><b class="num">' + inr(e) + '</b><small class="muted">Total interest ' + inr(e * Math.round(+$("#q-yrs").value * 12) - +$("#q-amt").value) + "</small>";
  }
  ["#q-amt", "#q-rate", "#q-yrs"].forEach(function (s) { $(s).addEventListener("input", upd); });
  upd();
};
function statCard(value, label, sub, go, filter, tone) {
  return '<button type="button" class="stat' + (tone ? " stat-" + tone : "") + '" data-go="' + go + '"' + (filter ? ' data-filter="' + filter + '"' : "") + '><span class="stat-label">' + esc(label) + '</span><span class="stat-num num">' + value + "</span>" + (sub ? '<span class="stat-sub">' + esc(sub) + "</span>" : "") + "</button>";
}
function appTable(list) {
  return '<div class="table-wrap"><table class="table"><thead><tr><th>Reference no.</th><th>Applicant</th><th>Loan</th><th class="right">Amount</th><th>Status</th><th>Updated</th></tr></thead><tbody>' +
    list.map(function (a) {
      return '<tr tabindex="0" data-go="' + (a.status === "draft" ? "apply" : "app") + '" data-id="' + a.id + '"><td><span class="mono ref">' + esc(a.ref) + "</span></td><td>" + esc(field_(a, "personal", "name") || "—") + "</td><td>" + esc(field_(a, "loan", "loanType") || "—") + '</td><td class="right num">' + (appAmount(a) ? inr(appAmount(a)) : "—") + "</td><td>" +
        statusBadge(a.status) + (a.status === "draft" ? '<small class="muted pct"> ' + a.completion + "% done</small>" : "") + '</td><td class="muted small">' + timeAgo(a.updatedAt) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
}

/* ============================================================ applications list */
var LIST = { q: "", status: "" };
VIEWS.applications = function (p) {
  if (p.filter !== undefined) { LIST.status = p.filter === "submitted" ? "completed" : p.filter; LIST.q = ""; S.params = {}; }
  var apps = sortedApps();
  var q = LIST.q.toLowerCase();
  var list = apps.filter(function (a) {
    var st = LIST.status;
    var okStatus = !st || (st === "completed" ? a.status !== "draft" : a.status === st);
    var hay = (a.ref + " " + appName(a) + " " + (field_(a, "personal", "phone") || "") + " " + appLoan(a)).toLowerCase();
    return okStatus && (!q || hay.indexOf(q) >= 0);
  });
  var chips = [["", "All"], ["draft", "Incomplete"], ["completed", "Completed"], ["with_bank", "With bank"], ["sanctioned", "Sanctioned"], ["disbursed", "Disbursed"], ["rejected", "Rejected"]];
  return pageHead("My applications", apps.length + " in total", '<button type="button" class="btn btn-primary" data-go="apply" data-fresh="1">' + icon("apply") + "New application</button>") +
    '<div class="filters"><input id="fl-q" type="search" placeholder="Search by reference number, name, mobile or loan type" value="' + esc(LIST.q) + '" aria-label="Search applications">' +
    '<div class="chips" role="group" aria-label="Filter by status">' + chips.map(function (c) {
      var n = c[0] === "" ? apps.length : c[0] === "completed" ? apps.filter(function (a) { return a.status !== "draft"; }).length : apps.filter(function (a) { return a.status === c[0]; }).length;
      return '<button type="button" class="chip' + (LIST.status === c[0] ? " active" : "") + '" data-act="filter" data-status="' + c[0] + '" aria-pressed="' + (LIST.status === c[0]) + '">' + c[1] + ' <span class="num">' + n + "</span></button>";
    }).join("") + "</div></div>" +
    '<section class="card flush">' + (list.length ? appTable(list) : empty(apps.length ? "No applications match your search." : "You haven't started any applications yet.", apps.length ? "" : '<button type="button" class="btn btn-primary" data-go="apply" data-fresh="1">Start application</button>')) + "</section>";
};
AFTER.applications = function () {
  var q = $("#fl-q"), t;
  q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { LIST.q = q.value; render(); var el = $("#fl-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); });
};
ACTIONS.filter = function (b) { LIST.status = b.dataset.status; render(); };

/* ============================================================ application form (6 steps) */
var F = { appId: null, step: "personal", timer: null, saving: null, touched: {} };
function draftOf(id) { var a = getApp(id); return a && a.status === "draft" ? a : null; }

VIEWS.apply = function (p) {
  var a = null;
  if (p.id) {
    a = getApp(p.id);
    if (a && a.status !== "draft") return pageHead("Loan application") + '<section class="card">' + empty("This application is already submitted.", '<button type="button" class="btn btn-primary" data-go="app" data-id="' + a.id + '">Open it</button>') + "</section>";
  }
  var id = a ? a.id : null;
  if (F.appId !== id || p.fresh) { F.step = a && a.step && a.step !== "review" ? a.step : "personal"; F.touched = {}; }
  F.appId = id;
  S.params = id ? { id: id } : {};
  return '<div class="page-head"><div><span class="eyebrow">Loan application</span><h1>' + (a && appLoan(a) !== "Loan type not chosen" ? esc(appLoan(a)) : "New loan application") + "</h1>" +
    '<p class="muted">Reference no. <b class="mono" id="f-ref">' + esc(a ? a.ref : "given when you start typing") + '</b> · <span id="save-state" class="save-state">' + (a ? "Saved " + timeAgo(a.updatedAt) : "Saves automatically") + "</span></p></div>" +
    (a ? '<div class="head-actions"><button type="button" class="btn btn-ghost btn-danger-ghost" data-act="delete-draft" data-id="' + a.id + '">Delete draft</button></div>' : "") +
    '<div class="form-progress"><span class="small muted">Completed</span><b class="num" id="f-pct">' + (a ? a.completion : 0) + '%</b><div id="f-bar">' + progressBar(a ? a.completion : 0, "Application completion") + "</div></div></div>" +
    '<ol class="stepper" aria-label="Application steps">' + STEPS.map(function (s, i) {
      return '<li><button type="button" class="step" data-act="step" data-step="' + s.id + '" id="tab-' + s.id + '"><span class="step-no">' + (i + 1) + '</span><span class="step-name">' + esc(s.title) + "</span></button></li>";
    }).join("") + "</ol>" +
    '<section class="card form-card" id="form-body" aria-live="polite"></section>' +
    '<div class="form-nav"><button type="button" class="btn btn-ghost" data-act="step-prev" id="btn-prev">Back</button><span class="grow"></span>' +
    '<button type="button" class="btn btn-ghost" data-act="save-later">Save &amp; finish later</button><button type="button" class="btn btn-primary" data-act="step-next" id="btn-next">Next</button></div>';
};
AFTER.apply = function () { drawStep(); };

function stepIndex(id) { return STEPS.map(function (s) { return s.id; }).indexOf(id); }
function inputFor(stepId, f, value) {
  var id = "f-" + f[0], type = f[2];
  if (Array.isArray(type)) return selectHtml(id, type, value);
  if (type === "textarea") return '<textarea id="' + id + '" rows="2">' + esc(value) + "</textarea>";
  var extra = type === "number" ? ' inputmode="decimal" min="0"' : type === "tel" ? ' inputmode="numeric" maxlength="10"' : "";
  if (f[0] === "aadhaarLast4") extra = ' inputmode="numeric" maxlength="4"';
  if (f[0] === "pincode") extra = ' inputmode="numeric" maxlength="6"';
  if (f[0] === "pan") extra = ' maxlength="10" autocapitalize="characters"';
  return '<input id="' + id + '" type="' + (type === "number" ? "number" : type) + '" value="' + esc(value) + '"' + extra + ">";
}
function drawStep() {
  var a = draftOf(F.appId), body = $("#form-body"); if (!body) return;
  var idx = stepIndex(F.step), step = STEPS[idx];
  $all(".step").forEach(function (b) {
    var s = STEPS[stepIndex(b.dataset.step)];
    b.classList.toggle("active", s.id === F.step);
    if (s.id === F.step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    b.classList.toggle("done", !!a && stepDone(a, s));
  });
  $("#btn-prev").hidden = idx === 0;
  $("#btn-next").textContent = step.id === "review" ? "Submit application" : "Next";
  $("#btn-next").dataset.act = step.id === "review" ? "submit-app" : "step-next";
  body.oninput = body.onchange = body.onfocusout = null;
  var head = '<div class="step-head"><span class="eyebrow">Step ' + (idx + 1) + " of " + STEPS.length + "</span><h2>" + esc(step.title) + "</h2>" + (step.intro ? '<p class="muted">' + esc(step.intro) + "</p>" : "") + "</div>";
  if (step.fields.length) {
    var src = a ? (a.data[step.id] || {}) : (step.id === "personal" ? { name: "", phone: "", email: "" } : {});
    body.innerHTML = head + '<div class="form-grid">' + step.fields.map(function (f) {
      return field("f-" + f[0], f[1], inputFor(step.id, f, src[f[0]] == null ? "" : src[f[0]]), { req: f[3], hint: f[4], full: f[5] });
    }).join("") + "</div>";
    body.oninput = onInput; body.onchange = onInput;
    body.onfocusout = function (e) { if (e.target.id) { F.touched[e.target.id] = 1; checkField(e.target.id); } };
  } else if (step.id === "documents") {
    body.innerHTML = head + (a ? docsPanel(a) : empty("Fill in the personal details first. The document list depends on the work and loan details."));
  } else {
    body.innerHTML = head + reviewHtml(a);
    if (a) mountBankPanel(false);
  }
  var first = body.querySelector("input, select, textarea");
  if (first && document.activeElement && document.activeElement.classList.contains("step")) first.focus();
}
function stepDone(a, s) {
  if (s.id === "documents") return Shared.requiredDocs(a).every(function (t) { return a.documents[t]; });
  if (s.id === "review") return false;
  return s.fields.every(function (f) { return !Shared.fieldError(f, (a.data[s.id] || {})[f[0]]); });
}
function fieldDef(inputId) {
  var key = inputId.replace(/^f-/, ""), step = STEPS[stepIndex(F.step)];
  return step.fields.filter(function (f) { return f[0] === key; })[0];
}
function checkField(inputId) {
  var f = fieldDef(inputId), el = $("#" + inputId), err = $("#" + inputId + "-err");
  if (!f || !el || !err) return true;
  var msg = Shared.fieldError(f, el.value);
  err.textContent = msg && F.touched[inputId] ? msg : "";
  el.closest(".field").classList.toggle("invalid", !!msg && !!F.touched[inputId]);
  el.setAttribute("aria-invalid", msg && F.touched[inputId] ? "true" : "false");
  return !msg;
}
function readStep() {
  var out = {};
  STEPS[stepIndex(F.step)].fields.forEach(function (f) { var el = $("#f-" + f[0]); if (el) out[f[0]] = el.value.trim(); });
  return out;
}
function onInput(e) {
  if (e.target.id && F.touched[e.target.id]) checkField(e.target.id);
  setSave("Unsaved changes…");
  clearTimeout(F.timer);
  F.timer = setTimeout(saveDraft, 900);
}
function setSave(t, cls) { var s = $("#save-state"); if (s) { s.textContent = t; s.className = "save-state " + (cls || ""); } }
function showProgress(a) {
  var p = $("#f-pct"); if (p) p.textContent = a.completion + "%";
  var b = $("#f-bar"); if (b) b.innerHTML = progressBar(a.completion, "Application completion");
}
/* Saves are queued one after another, and each save sends only the step it belongs to. */
var saveQueue = Promise.resolve();
function saveDraft() {
  clearTimeout(F.timer);
  var step = STEPS[stepIndex(F.step)];
  if (!step.fields.length || !$("#form-body")) return saveQueue.then(function () { return draftOf(F.appId); });
  var data = readStep(), stepId = step.id;       // read the fields now, while they are on screen
  var any = Object.keys(data).some(function (k) { return data[k] !== ""; });
  var job = saveQueue.then(async function () {
    if (!F.appId && !any) return null;
    setSave("Saving…");
    try {
      var saved = F.appId ? await DB.saveSection(F.appId, stepId, data) : await DB.createApp(stepId, data);
      if (!F.appId) { F.appId = saved.id; refresh({ silent: true }).then(updateBell).catch(function () {}); }
      if (S.route === "apply") S.params = { id: saved.id };
      var r = $("#f-ref"); if (r) r.textContent = saved.ref;
      showProgress(saved);
      setSave("Saved automatically · " + new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }), "ok");
      var tab = $("#tab-" + stepId); if (tab) tab.classList.toggle("done", stepDone(saved, step));
      return saved;
    } catch (e) { setSave("Not saved: " + e.message, "err"); return null; }
  });
  saveQueue = job.catch(function () {});
  return job;
}
async function goStep(id) {
  if (STEPS[stepIndex(F.step)].fields.length) await saveDraft();
  F.step = id;
  drawStep();
  if (F.appId && id !== "review") DB.setStep(F.appId, id).catch(function () {});
  var t = $("#tab-" + id); if (t) t.scrollIntoView({ block: "nearest", inline: "center" });
  var h = $(".step-head h2"); if (h) h.setAttribute("tabindex", "-1");
}
ACTIONS.step = function (b) { goStep(b.dataset.step); };
ACTIONS["step-next"] = function () {
  var step = STEPS[stepIndex(F.step)];
  var bad = step.fields.filter(function (f) { var id = "f-" + f[0]; F.touched[id] = 1; return !checkField(id); });
  if (bad.length) { toast("Please fix the highlighted fields. Your answers are saved.", "error"); $("#f-" + bad[0][0]).focus(); saveDraft(); return; }
  goStep(STEPS[Math.min(STEPS.length - 1, stepIndex(F.step) + 1)].id);
};
ACTIONS["step-prev"] = function () { goStep(STEPS[Math.max(0, stepIndex(F.step) - 1)].id); };
ACTIONS["save-later"] = async function () {
  var a = (await saveDraft()) || draftOf(F.appId);
  if (!a) return toast("Nothing to save yet. Fill in at least one field.", "error");
  await refresh({ silent: true });
  toast("Saved as " + a.ref + ". Continue any time from your dashboard.");
  go("dashboard");
};
ACTIONS.jump = function (b) {
  goStep(b.dataset.step).then(function () { var id = "f-" + b.dataset.key, el = $("#" + id); if (el) { F.touched[id] = 1; checkField(id); el.focus(); } });
};
function reviewHtml(a) {
  if (!a) return empty("Nothing to review yet. Start with the personal details.");
  var probs = Shared.problems(a), missingDocs = Shared.requiredDocs(a).filter(function (t) { return !a.documents[t]; });
  var L = a.data.loan || {}, W = a.data.work || {};
  var e = Shared.emi(L.amount, 10.5, Math.round((+L.tenure || 5) * 12)), income = (+W.income || 0) + (+W.otherIncome || 0);
  var foir = income ? Math.round((e + (+L.existingEmi || 0)) / income * 100) : null;
  return (probs.length ? '<div class="alert alert-warn"><b>Complete these before submitting</b><ul>' + probs.map(function (p) {
      return '<li><button type="button" class="link" data-act="jump" data-step="' + p.step + '" data-key="' + p.key + '">' + esc(p.label) + "</button>: " + esc(p.msg) + "</li>";
    }).join("") + "</ul></div>" : '<div class="alert alert-good"><b>All required details are filled in.</b> Check them once more, then submit.</div>') +
    (missingDocs.length ? '<div class="alert alert-info">' + missingDocs.length + ' document(s) not uploaded yet. You can submit now and <button type="button" class="link" data-act="step" data-step="documents">add them</button> later.</div>' : "") +
    '<div class="estimate"><div><span class="mini-label">Estimated EMI at 10.5%</span><b class="num">' + inr(e) + '</b></div><div><span class="mini-label">EMIs as share of income</span><b class="num">' + (foir == null ? "—" : foir + "%") + '</b></div><p class="small muted">A rough guide. The lender decides the final rate.</p></div>' +
    '<div class="review-grid">' + STEPS.filter(function (s) { return s.fields.length; }).map(function (s) {
      return '<div class="review-block"><div class="card-head"><h3>' + esc(s.title) + '</h3><button type="button" class="link" data-act="step" data-step="' + s.id + '">Edit</button></div><dl class="kv">' +
        s.fields.map(function (f) { return "<dt>" + esc(f[1]) + "</dt><dd>" + fmtField(f, (a.data[s.id] || {})[f[0]]) + "</dd>"; }).join("") + "</dl></div>";
    }).join("") + "</div>" +
    bankPanel(a, { compact: true }) +
    '<label class="consent"><input type="checkbox" id="r-consent"> I confirm these details are correct and agree that they can be shared with lenders for this loan application.</label>';
}
function fmtField(f, v) {
  if (v == null || v === "") return '<span class="muted">—</span>';
  if (f[2] === "date") return esc(fmtDate(v));
  if (/₹/.test(f[1])) return '<span class="num">' + inr(v) + "</span>";
  return esc(v);
}
ACTIONS["submit-app"] = async function (b) {
  var a = draftOf(F.appId);
  if (!a) return toast("Fill in the form first.", "error");
  if (Shared.problems(a).length) return toast("Complete the items listed at the top first.", "error");
  if (!$("#r-consent").checked) { toast("Tick the confirmation box to submit.", "error"); $("#r-consent").focus(); return; }
  b.disabled = true; b.textContent = "Submitting…";
  try {
    var r = await DB.submit(a.id);
    await refresh({ silent: true });
    F.appId = null;
    modal({ title: "Application submitted", body: '<div class="center"><div class="big-check" aria-hidden="true">✓</div><p>Your reference number is</p><p class="mono big-ref">' + esc(r.ref) + '</p><p class="muted">Keep this number. Quote it whenever you contact us about this loan.</p></div>',
      actions: [{ label: "View application", onClick: function (c) { c(); go("app", { id: r.id }); } }, { label: "Go to dashboard", kind: "primary", onClick: function (c) { c(); go("dashboard"); } }] });
  } catch (e) { b.disabled = false; b.textContent = "Submit application"; toast(e.message, "error"); }
};

/* ---------------------------------------------------------- documents */
function docsPanel(a) {
  var req = Shared.requiredDocs(a), extra = Object.keys(a.documents || {}).filter(function (t) { return req.indexOf(t) < 0; });
  var have = req.filter(function (t) { return a.documents[t]; }).length;
  var closed = ["disbursed", "rejected", "withdrawn"].indexOf(a.status) >= 0;
  var optional = Object.keys(DOC_TYPES).filter(function (t) { return req.indexOf(t) < 0 && extra.indexOf(t) < 0; });
  return '<div class="doc-summary"><b class="num">' + have + " of " + req.length + ' required documents uploaded</b>' + progressBar(req.length ? have / req.length * 100 : 0, "Documents uploaded") + "</div>" +
    '<ul class="doc-list">' + req.concat(extra).map(function (t) {
      var d = a.documents[t];
      return '<li class="doc-row' + (d ? " has" : "") + '"><span class="doc-icon" aria-hidden="true">' + (d ? "✓" : "") + '</span><div class="doc-main"><b>' + esc(DOC_TYPES[t]) + "</b>" +
        (d ? '<small class="muted"><span class="mono">' + esc(d.fileName) + "</span> · " + Math.max(1, Math.round(d.size / 1024)) + " KB · " + fmtDate(d.at) + "</small>" : '<small class="muted">' + (req.indexOf(t) >= 0 ? "Required" : "Optional") + "</small>") + "</div>" +
        '<div class="doc-actions">' + (d ? '<button type="button" class="btn-sm" data-act="doc-view" data-id="' + a.id + '" data-type="' + t + '">View</button>' : "") +
        (!closed ? '<label class="btn-sm upload">' + (d ? "Replace" : "Upload") + '<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" data-upload="' + a.id + '" data-type="' + t + '" hidden></label>' : "") +
        (d && !closed ? '<button type="button" class="btn-sm bad" data-act="doc-remove" data-id="' + a.id + '" data-type="' + t + '">Remove</button>' : "") + "</div></li>";
    }).join("") + "</ul>" +
    (!closed && optional.length ? '<div class="row gap wrap add-doc"><label for="extra-doc" class="small muted">Add another document:</label>' + selectHtml("extra-doc", optional.map(function (t) { return [t, DOC_TYPES[t]]; }), "", "Choose type") +
      '<label class="btn-sm upload" id="extra-upload" hidden>Upload<input type="file" accept=".pdf,.jpg,.jpeg,.png" data-upload="' + a.id + '" data-type="" hidden></label></div>' : "");
}
document.addEventListener("change", async function (e) {
  if (e.target.id === "extra-doc") {
    var up = $("#extra-upload"); up.hidden = !e.target.value; up.querySelector("input").dataset.type = e.target.value; return;
  }
  var inp = e.target.closest && e.target.closest("input[data-upload]");
  if (!inp || !inp.files || !inp.files[0] || !inp.dataset.type) return;
  var f = inp.files[0], appId = inp.dataset.upload, type = inp.dataset.type;
  if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { toast("Upload a PDF, JPG or PNG file.", "error"); inp.value = ""; return; }
  if (f.size > Shared.MAX_UPLOAD) { toast("This file is " + (f.size / 1048576).toFixed(1) + " MB. The limit is 5 MB.", "error"); inp.value = ""; return; }
  var label = inp.closest("label"); if (label) label.firstChild.textContent = "Uploading…";
  try {
    var saved = await DB.uploadDoc(appId, type, f);
    refresh({ silent: true }).then(updateBell).catch(function () {});
    toast(DOC_TYPES[type] + " uploaded.");
    if (S.route === "apply") { showProgress(saved); drawStep(); } else render();
  } catch (err) { toast(err.message, "error"); if (label) label.firstChild.textContent = "Upload"; inp.value = ""; }
});
ACTIONS["doc-remove"] = async function (b) {
  if (!(await confirmBox("Remove " + DOC_TYPES[b.dataset.type] + "?", "The file will be deleted. You can upload it again later.", "Remove", "danger"))) return;
  try {
    var saved = await DB.removeDoc(b.dataset.id, b.dataset.type);
    toast("Document removed.");
    if (S.route === "apply") { showProgress(saved); drawStep(); } else render();
  } catch (e) { toast(e.message, "error"); }
};

/* ============================================================ application detail */
VIEWS.app = function (p) {
  var a = getApp(p.id);
  if (!a) return pageHead("Application") + '<section class="card">' + empty("This application was not found.", '<button type="button" class="btn btn-primary" data-go="applications">Back to my applications</button>') + "</section>";
  var L = a.data.loan || {}, W = a.data.work || {};
  var months = Math.round((+L.tenure || 0) * 12), e = Shared.emi(L.amount, 10.5, months);
  var closed = ["disbursed", "rejected", "withdrawn"].indexOf(a.status) >= 0;
  return '<button type="button" class="back no-print" data-go="applications">← My applications</button>' +
    '<div class="page-head"><div><span class="eyebrow">Reference no.</span><h1 class="mono">' + esc(a.ref) + '</h1><p class="muted">' + esc(appName(a)) + " · " + esc(appLoan(a)) + " · " + inr(appAmount(a)) + (L.tenure ? " over " + esc(L.tenure) + " years" : "") + "</p></div>" +
    '<div class="head-actions no-print">' + statusBadge(a.status) +
    (a.status !== "draft" && !closed ? '<button type="button" class="btn btn-ghost" data-act="status" data-id="' + a.id + '">Update status</button>' : "") +
    '<button type="button" class="btn btn-ghost" data-act="print">Print summary</button></div></div>' +
    trackerHtml(a) + bankPanel(a) +
    '<div class="detail-grid"><div class="stack">' +
    STEPS.filter(function (s) { return s.fields.length; }).map(function (s) {
      return '<section class="card"><h3>' + esc(s.title) + '</h3><dl class="kv">' + s.fields.map(function (f) { return "<dt>" + esc(f[1]) + "</dt><dd>" + fmtField(f, (a.data[s.id] || {})[f[0]]) + "</dd>"; }).join("") + "</dl></section>";
    }).join("") + "</div>" +
    '<div class="stack"><section class="card"><h3>EMI estimate</h3><div class="calc-mini"><span class="mini-label">At 10.5% a year</span><b class="num">' + inr(e) + '</b><small>per month for ' + (months || "—") + " months</small></div>" +
    '<dl class="kv"><dt>Monthly income</dt><dd class="num">' + inr((+W.income || 0) + (+W.otherIncome || 0)) + '</dd><dt>Existing EMIs</dt><dd class="num">' + inr(L.existingEmi || 0) + "</dd></dl>" +
    '<button type="button" class="link no-print" data-act="open-calc" data-id="' + a.id + '">Try other rates in the calculator</button></section>' +
    '<section class="card"><h3>Documents</h3>' + docsPanel(a) + "</section>" +
    '<section class="card"><h3>Activity</h3><ol class="activity">' + a.history.slice().reverse().map(function (h) {
      return "<li>" + statusBadge(h.status) + "<p>" + esc(h.note || STATUS[h.status][0]) + '</p><small class="muted">' + fmtDateTime(h.at) + "</small></li>";
    }).join("") + "</ol></section></div></div>";
};
function trackerHtml(a) {
  var flow = Shared.TRACK, cur = flow.indexOf(a.status), side = a.status === "rejected" || a.status === "withdrawn";
  if (side) a.history.forEach(function (h) { var i = flow.indexOf(h.status); if (i > cur) cur = i; });
  return '<section class="card tracker-card">' + (side ? '<div class="alert alert-' + (a.status === "rejected" ? "bad" : "info") + '"><b>' + STATUS[a.status][0] + "</b>" + (function () { var l = a.history[a.history.length - 1]; return l && l.note ? " · " + esc(l.note) : ""; })() + "</div>" : "") +
    '<ol class="tracker">' + flow.map(function (s, i) {
      var st = i < cur || (i === cur && (side || s === "disbursed")) ? "done" : i === cur ? "current" : "todo";
      var h = a.history.filter(function (x) { return x.status === s; })[0];
      return '<li class="tr-' + st + '"><span class="tr-dot" aria-hidden="true"></span><b>' + STATUS[s][0] + "</b><small>" + (h ? fmtDate(h.at) : "") + "</small></li>";
    }).join("") + "</ol></section>";
}
ACTIONS.print = function () { window.print(); };
ACTIONS["open-calc"] = function (b) {
  var a = getApp(b.dataset.id), L = a.data.loan || {}, W = a.data.work || {};
  CALC.amount = +L.amount || CALC.amount; CALC.years = +L.tenure || CALC.years; CALC.income = (+W.income || 0) + (+W.otherIncome || 0) || CALC.income; CALC.existing = +L.existingEmi || 0;
  go("calculator");
};
ACTIONS.status = function (b) {
  var a = getApp(b.dataset.id);
  var opts = Object.keys(STATUS).filter(function (s) { return s !== "draft" && s !== a.status; });
  modal({ title: "Update status · " + a.ref, body: '<p class="muted">Now: ' + statusBadge(a.status) + "</p>" +
    field("st-to", "New status", selectHtml("st-to", opts.map(function (s) { return [s, STATUS[s][0]]; }), opts[0], false)) +
    field("st-note", "Note (optional)", '<textarea id="st-note" rows="2" maxlength="300" placeholder="For example, the sanctioned amount or the reason"></textarea>'),
    actions: [{ label: "Cancel" }, { label: "Save", kind: "primary", onClick: async function (close) {
      try { await DB.setStatus(a.id, $("#st-to").value, $("#st-note").value.trim()); close(); await refresh(); toast("Status updated."); }
      catch (e) { modalError(e.message); }
    } }] });
};
ACTIONS["delete-draft"] = async function (b) {
  var a = getApp(b.dataset.id);
  if (!(await confirmBox("Delete " + a.ref + "?", "This incomplete application and its uploaded files will be deleted for good.", "Delete", "danger"))) return;
  var r = await act(function () { return DB.deleteApp(a.id).then(function () { return true; }); }, "Application deleted.");
  if (r) { F.appId = null; go("dashboard"); }
};

/* ============================================================ EMI calculator */
var CALC = { amount: 2500000, rate: 9.5, years: 15, income: 100000, existing: 0, foir: 60 };
VIEWS.calculator = function () {
  return pageHead("EMI calculator", "Change any value. The results update as you type.") +
    '<div class="calc-grid"><section class="card"><div class="form-grid">' +
    field("ca-amount", "Loan amount (₹)", '<input id="ca-amount" type="number" min="0" step="10000" value="' + CALC.amount + '">', { full: 1 }) +
    '<div class="field full"><label for="ca-amount-r" class="sr-only">Loan amount slider</label><input id="ca-amount-r" type="range" min="50000" max="20000000" step="50000" value="' + CALC.amount + '"></div>' +
    field("ca-rate", "Interest rate (% a year)", '<input id="ca-rate" type="number" min="1" max="36" step="0.05" value="' + CALC.rate + '">') +
    field("ca-years", "Tenure (years)", '<input id="ca-years" type="number" min="1" max="30" value="' + CALC.years + '">') +
    field("ca-income", "Monthly income (₹)", '<input id="ca-income" type="number" min="0" step="1000" value="' + CALC.income + '">') +
    field("ca-existing", "Existing EMIs (₹ a month)", '<input id="ca-existing" type="number" min="0" step="500" value="' + CALC.existing + '">') +
    field("ca-foir", "Lender's EMI limit (% of income)", '<input id="ca-foir" type="number" min="10" max="90" value="' + CALC.foir + '">', { hint: "Most lenders allow 50–65%." }) +
    '</div></section><section class="card" id="calc-out"></section></div>' +
    '<section class="card"><h3>Year-by-year repayment</h3><div id="calc-sched"></div></section>';
};
AFTER.calculator = function () {
  function upd(e) {
    if (e && e.target.id === "ca-amount-r") $("#ca-amount").value = e.target.value;
    if (e && e.target.id === "ca-amount") $("#ca-amount-r").value = e.target.value;
    ["amount", "rate", "years", "income", "existing", "foir"].forEach(function (k) { var v = +$("#ca-" + k).value; if (isFinite(v)) CALC[k] = v; });
    var n = Math.round(CALC.years * 12), m = Shared.emi(CALC.amount, CALC.rate, n), total = m * n;
    var foir = CALC.income ? (m + CALC.existing) / CALC.income * 100 : 0;
    var maxLoan = Math.max(0, Shared.principalFor(CALC.income * CALC.foir / 100 - CALC.existing, CALC.rate, n));
    var over = foir > CALC.foir, pPct = total ? CALC.amount / total * 100 : 0;
    $("#calc-out").innerHTML = '<div class="calc-big"><span class="mini-label">Monthly EMI</span><b class="num">' + inr(m) + "</b></div>" +
      '<dl class="kv"><dt>Total interest</dt><dd class="num">' + inr(total - CALC.amount) + '</dd><dt>Total payable</dt><dd class="num">' + inr(total) + "</dd>" +
      '<dt>EMIs as share of income</dt><dd class="num">' + foir.toFixed(1) + "% " + badge(over ? "Above " + CALC.foir + "% limit" : "Within limit", over ? "bad" : "good") + "</dd>" +
      '<dt>Most you could borrow</dt><dd class="num">' + inr(maxLoan) + "</dd></dl>" +
      '<div class="split" role="img" aria-label="Principal ' + Math.round(pPct) + ' percent, interest ' + Math.round(100 - pPct) + ' percent"><span class="split-p" style="width:' + pPct + '%"></span><span class="split-i"></span></div>' +
      '<p class="small muted"><span class="key key-p"></span>Principal ' + Math.round(pPct) + '% · <span class="key key-i"></span>Interest ' + Math.round(100 - pPct) + "%</p>";
    var bal = CALC.amount, r = CALC.rate / 1200, rows = [];
    for (var y = 1; y <= Math.ceil(n / 12) && y <= 40; y++) {
      var pi = 0, ii = 0;
      for (var k = 0; k < 12 && bal > 0.5; k++) { var it = bal * r, pr = Math.min(bal, m - it); ii += it; pi += pr; bal -= pr; }
      rows.push([y, pi, ii, Math.max(0, bal)]);
    }
    $("#calc-sched").innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>Year</th><th class="right">Principal paid</th><th class="right">Interest paid</th><th class="right">Balance at year end</th></tr></thead><tbody>' +
      rows.map(function (x) { return '<tr><td class="num">' + x[0] + '</td><td class="right num">' + inr(x[1]) + '</td><td class="right num">' + inr(x[2]) + '</td><td class="right num">' + inr(x[3]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  $all("#view input").forEach(function (i) { i.addEventListener("input", upd); });
  upd();
};

/* ============================================================ notifications & profile */
VIEWS.notifications = function () {
  var list = S.notifs;
  return pageHead("Notifications", unread() + " unread", (unread() ? '<button type="button" class="btn btn-ghost" data-act="read-all">Mark all as read</button>' : "") + (list.length ? '<button type="button" class="btn btn-ghost" data-act="clear-notifs">Clear all</button>' : "")) +
    '<section class="card">' + (list.length ? '<ul class="notif-list">' + list.map(function (n) {
      return '<li><button type="button" class="bell-item' + (n.read ? "" : " unread") + '" data-act="open-notif" data-id="' + n.id + '"><span>' + esc(n.text) + "</span><small>" + fmtDateTime(n.at) + "</small></button></li>";
    }).join("") + "</ul>" : empty("You're all caught up.")) + "</section>";
};
ACTIONS["clear-notifs"] = async function () {
  if (!(await confirmBox("Clear all notifications?", "They will be removed from this list.", "Clear all", "danger"))) return;
  act(function () { return DB.clearNotifs(); }, "Notifications cleared.");
};
VIEWS.profile = function () {
  var u = S.me;
  return pageHead("Profile", "Your account details, password and display settings.") + '<div class="calc-grid"><section class="card"><h3>Account</h3><div class="form-grid">' +
    field("pf-name", "Full name", '<input id="pf-name" type="text" value="' + esc(u.name) + '">', { full: 1 }) +
    field("pf-email", "Email", '<input id="pf-email" type="email" value="' + esc(u.email) + '" disabled>', { hint: "Used to sign in. It can't be changed here." }) +
    field("pf-phone", "Mobile number", '<input id="pf-phone" type="tel" maxlength="10" value="' + esc(u.phone) + '">') +
    '</div><div class="row gap"><button type="button" class="btn btn-primary" data-act="save-profile">Save changes</button></div>' +
    '<h3 class="mt">Appearance</h3><div class="theme-pick" role="group" aria-label="Theme"><button type="button" class="chip' + (currentTheme() === "light" ? " active" : "") + '" data-act="set-theme" data-theme="light">Light mode</button><button type="button" class="chip' + (currentTheme() === "dark" ? " active" : "") + '" data-act="set-theme" data-theme="dark">Dark mode</button></div></section>' +
    '<section class="card"><h3>Change password</h3><div class="form-grid">' +
    field("pw-cur", "Current password", '<input id="pw-cur" type="password" autocomplete="current-password">', { full: 1 }) +
    field("pw-new", "New password", '<input id="pw-new" type="password" autocomplete="new-password">', { full: 1, hint: "At least 8 characters, with letters and numbers. Other devices will be signed out." }) +
    '</div><div class="row gap"><button type="button" class="btn btn-ghost" data-act="change-pw">Change password</button><button type="button" class="btn btn-ghost" data-act="logout">Sign out</button></div></section></div>';
};
ACTIONS["save-profile"] = function () { act(function () { return DB.saveProfile($("#pf-name").value.trim(), $("#pf-phone").value.trim()); }, "Profile saved."); };
ACTIONS["change-pw"] = function () { act(function () { var n = $("#pw-new").value; if (n.length < 8 || !/[A-Za-z]/.test(n) || !/\d/.test(n)) return Promise.reject(new ApiError("Use at least 8 characters, with letters and numbers.")); return DB.changePassword($("#pw-cur").value, n); }, "Password changed."); };
ACTIONS["set-theme"] = function (b) { setTheme(b.dataset.theme); render(); };

ACTIONS["doc-view"] = async function (b) {
  var w = window.open("", "_blank");
  try {
    var url = await DB.docUrl(b.dataset.id, b.dataset.type);
    if (w) w.location = url; else location.assign(url);
  } catch (e) { if (w) w.close(); toast(e.message || friendly(e), "error"); }
};

AFTER.app = function () { mountBankPanel(false); };
