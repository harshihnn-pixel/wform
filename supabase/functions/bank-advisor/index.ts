// bank-advisor — Supabase Edge Function: Gemini explains which banks fit an application.
//
// Deploy:   supabase functions deploy bank-advisor
//      or   Dashboard → Edge Functions → Deploy a new function → Via editor → name "bank-advisor" → paste this file
// Secret:   supabase secrets set GEMINI_API_KEY=AIza...      (Dashboard → Edge Functions → Secrets)
//
// Security
// - Only signed-in users: the request's login token is checked with Supabase Auth.
// - Every database read uses THAT user's token, so Row Level Security applies: a person can only
//   analyse their own applications. No service-role key is used.
// - Before anything goes to Gemini, identifying details are removed: no name, phone, email,
//   PAN, Aadhaar, address or employer name. Gemini only sees the numbers the banks' rules need.
// - The Gemini key stays on the server.

// deno-lint-ignore-file no-explicit-any
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const env = (k: string) => ((globalThis as any).Deno?.env?.get(k) || "").trim();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const DISCLAIMER = "Eligibility is indicative. The final decision, interest rate and loan amount are always the lender's.";

/* ------------------------------------------------------------------ Supabase calls as the user */
type Caller = { token: string; apikey: string; userId: string };
async function caller(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const apikey = (req.headers.get("apikey") || env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY")).trim();
  if (!token || token.split(".").length !== 3 || token === apikey) throw new HttpError(401, "Please sign in first.");
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey } });
  if (!r.ok) throw new HttpError(401, "Your session has ended. Please sign in again.");
  const u = await r.json();
  if (!u?.id) throw new HttpError(401, "Your session has ended. Please sign in again.");
  return { token, apikey, userId: u.id };
}
async function rest(c: Caller, path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    method: init.method || "GET",
    headers: { apikey: c.apikey, Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await r.text();
  let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 400, (data && data.message) || `Database error (${r.status})`);
  return data;
}

/* ------------------------------------------------------------------ Gemini (with model fallback) */
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
let workingModel: string | null = null;
function geminiKey() {
  for (const k of ["GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
    let v = env(k);
    if (v.length >= 2 && /^["'].*["']$/.test(v)) v = v.slice(1, -1);
    if (v) return v.replace(/[\r\n]/g, "");
  }
  return "";
}
const geminiBase = () => env("GEMINI_API_BASE") || "https://generativelanguage.googleapis.com/v1beta";
async function discoverModel(key: string): Promise<string | null> {
  try {
    const r = await fetch(`${geminiBase()}/models`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) return null;
    const names: string[] = ((await r.json()).models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: any) => String(m.name).replace(/^models\//, ""))
      .filter((n: string) => /flash/i.test(n) && !/preview|exp|tts|image|live|thinking/i.test(n));
    names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return names[0] || null;
  } catch { return null; }
}
async function gemini(system: string, contents: any[], config: Record<string, unknown>): Promise<string> {
  const key = geminiKey();
  if (!key) throw new HttpError(503, "The AI assistant isn't set up yet (GEMINI_API_KEY is missing on the server).");
  const pinned = env("GEMINI_MODEL");
  const tries = pinned ? [pinned] : workingModel ? [workingModel] : [...MODELS];
  const attempt = async (model: string) => fetch(`${geminiBase()}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: config }),
  });
  let res: Response | null = null, used = "";
  for (const m of tries) { res = await attempt(m); used = m; if (res.status !== 404) break; }
  if (res && res.status === 404 && !pinned) { const d = await discoverModel(key); if (d) { res = await attempt(d); used = d; } }
  if (!res) throw new HttpError(502, "Could not reach the AI service.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `AI service error ${res.status}`;
    if (res.status === 429) throw new HttpError(429, "The AI assistant is busy (usage limit reached). Try again in a minute.");
    if (/API key not valid/i.test(msg)) throw new HttpError(503, "The AI key on the server is not valid. Set GEMINI_API_KEY again.");
    throw new HttpError(502, msg);
  }
  workingModel = used;
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("").trim();
  if (!text) throw new HttpError(502, "The AI assistant returned no answer. Try again.");
  return text;
}

/* ------------------------------------------------------------------ building the context */
const pick = (o: any, k: string) => (o && o[k] != null && String(o[k]).trim() !== "" ? String(o[k]).trim() : null);
function age(dob: string | null) {
  if (!dob) return null; const d = new Date(dob); if (isNaN(d.getTime())) return null;
  const n = new Date(); let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
}
/** Only what the bank rules need. No name, phone, email, PAN, Aadhaar, address or employer name. */
function anonymousProfile(app: any) {
  const d = app.data || {}, p = d.personal || {}, a = d.address || {}, w = d.work || {}, l = d.loan || {};
  return {
    age: age(pick(p, "dob")), marital_status: pick(p, "marital"), state: pick(a, "state"), residence: pick(a, "residence"),
    employment_type: pick(w, "empType"), employer_type: pick(w, "companyType"), payroll: pick(w, "payroll"), industry: pick(w, "industry"),
    experience_years: pick(w, "experience"), monthly_income: pick(w, "income"), other_monthly_income: pick(w, "otherIncome"),
    loan_type: pick(l, "loanType"), loan_amount: pick(l, "amount"), tenure_years: pick(l, "tenure"), purpose: pick(l, "purpose"),
    existing_emis_per_month: pick(l, "existingEmi"), cibil: pick(l, "cibil"), enquiries_last_3_months: pick(l, "enquiries"),
    emi_bounces_last_12_months: pick(l, "bounces"), settled_loans: pick(l, "settled"), property_value: pick(l, "propertyValue"),
    has_co_applicant: !!pick(l, "coApplicant"),
  };
}
const label = (r: any) => r.bank_name + (r.variant ? ` (${r.variant})` : "");
async function loadContext(c: Caller, appId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(appId)) throw new HttpError(400, "Choose an application.");
  const apps = await rest(c, `applications?id=eq.${appId}&select=id,ref,data,status`);
  if (!apps || !apps.length) throw new HttpError(404, "Application not found.");            // RLS: not yours → not found
  const results = await rest(c, "rpc/check_lenders", { method: "POST", body: { p_application: appId } });
  const ids = results.filter((r: any) => r.result !== "not_eligible").slice(0, 10).map((r: any) => r.lender_id);
  const policies = ids.length ? await rest(c, `lenders?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,policy`) : [];
  const pol: Record<string, any> = {}; (policies || []).forEach((x: any) => { pol[x.id] = x.policy; });
  return { app: apps[0], results, pol };
}
function contextText(ctx: any) {
  const r = ctx.results;
  const fmt = (x: any) => ({ id: x.lender_id, lender: label(x), result: x.result, roi_from: x.roi_min, roi_to: x.roi_max, eligible_amount: x.eligible_amount,
    est_emi: x.est_emi, passes: x.reasons_ok, to_confirm: x.reasons_check, fails: x.reasons_fail });
  return "APPLICANT (anonymous):\n" + JSON.stringify(anonymousProfile(ctx.app), null, 1) +
    "\n\nRULE CHECK RESULTS (from the lenders' written 2024 personal-loan policies):\n" + JSON.stringify(r.map(fmt), null, 1) +
    "\n\nPOLICY NOTES FROM THE SHEET for lenders that can or may apply (informal DSA notes; FOIR = EMIs/income, BT = balance transfer, CIBIL -1 = no history, Cat A/B/C = company category, MCA = company registration years, DPD = days past due):\n" +
    Object.entries(ctx.pol).map(([id, p]: any) => `--- ${id}\n` + Object.entries(p).map(([k, v]) => `${k}: ${v}`).join("\n")).join("\n\n");
}

const RULES = `You are a loan eligibility assistant for an Indian loan advisory company. You help an applicant understand which banks and NBFCs they can apply to.
Rules:
- Use ONLY the applicant data, rule check results and policy notes given. Never invent a bank, rate, limit or policy.
- The rule check is already done; do not contradict a "fails" item. You may explain notes the numbers missed (e.g. company category, CIBIL history, documents).
- Never promise approval. Always treat results as indicative; the lender decides.
- Plain, friendly English for a customer. Short sentences. Amounts in Indian format (₹5,00,000 / ₹5 L). No markdown headings.
- The sheet contains PERSONAL LOAN policies. If the loan type is different, say the applicant should confirm the lender's policy for that loan type.
- Don't ask for or mention names, phone numbers, PAN or Aadhaar.`;

/* ------------------------------------------------------------------ handler */
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const c = await caller(req);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "chat" ? "chat" : "analyse";
    const ctx = await loadContext(c, String(body.application_id || ""));

    if (mode === "analyse") {
      const prompt = contextText(ctx) + `

Reply with ONLY a JSON object (no markdown, no comments) with these keys:
"summary": 2-3 sentences on how strong the profile is and how many lenders fit;
"best_options": up to 4 objects {"id": lender id exactly as in the results, "why": one sentence}, best first, only lenders whose result is "eligible" or "check";
"watch_outs": up to 4 short points the applicant should know or confirm;
"improve": up to 4 practical steps that would open more lenders;
"documents": up to 6 documents the policy notes say will be asked for.`;
      const text = await gemini(RULES, [{ role: "user", parts: [{ text: prompt }] }], { temperature: 0.2, maxOutputTokens: 1400, responseMimeType: "application/json" });
      let parsed: any;
      try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }
      catch { throw new HttpError(502, "The AI answer could not be read. Try again."); }
      const known = new Set(ctx.results.map((r: any) => r.lender_id));
      const out = {
        summary: String(parsed.summary || "").slice(0, 800),
        best_options: (Array.isArray(parsed.best_options) ? parsed.best_options : []).filter((o: any) => known.has(o?.id)).slice(0, 4)
          .map((o: any) => ({ id: o.id, lender: label(ctx.results.find((r: any) => r.lender_id === o.id)), why: String(o.why || "").slice(0, 300) })),
        watch_outs: (parsed.watch_outs || []).slice(0, 4).map((s: any) => String(s).slice(0, 300)),
        improve: (parsed.improve || []).slice(0, 4).map((s: any) => String(s).slice(0, 300)),
        documents: (parsed.documents || []).slice(0, 6).map((s: any) => String(s).slice(0, 120)),
        disclaimer: DISCLAIMER,
        generated_at: new Date().toISOString(),
      };
      await rest(c, `applications?id=eq.${ctx.app.id}`, { method: "PATCH", body: { ai_analysis: out } }).catch(() => {});
      return json(out);
    }

    // chat: follow-up questions about this application's bank options
    const history = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
      .filter((m: any) => m && typeof m.content === "string" && m.content.trim())
      .map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 2000) }] }));
    if (!history.length || history[history.length - 1].role !== "user") throw new HttpError(400, "Type a question.");
    const system = RULES + "\n- Answer the applicant's question about THIS application in under 150 words. Use bullet points when listing banks.\n\nCONTEXT:\n" + contextText(ctx);
    const reply = await gemini(system, history, { temperature: 0.3, maxOutputTokens: 700 });
    return json({ reply, disclaimer: DISCLAIMER });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}

if (typeof (globalThis as any).Deno?.serve === "function") (globalThis as any).Deno.serve(handler);
