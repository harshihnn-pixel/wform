# Loan Portal (Supabase)

A loan application website for applicants. Accounts and data are stored in **Supabase**, and every account must **confirm its email** before signing in.

**Bank eligibility:** each application is compared with the lending rules of **26 bank and NBFC policies** from *Policy details as per 2024.xlsx*. The site shows which banks the person **can apply to**, which to **check with**, and which they **can't apply to**, with the reason for each. A **Gemini AI assistant** explains the result, suggests the best options and how to qualify for more banks, and answers questions.

## How sign-up works

1. The person fills in **Create account** (name, email, mobile, password).
2. Supabase saves the account and emails them a **confirmation link**. The site shows "Confirm your email".
3. They click the link in the email, on any device. The website opens with **"Email confirmed. Sign in to continue."**
4. They sign in, and the **dashboard** opens.

Anyone who tries to sign in before confirming is stopped and offered **Resend confirmation email**. **Forgot password?** emails a reset link.

## What is stored in Supabase

| Where | What |
|---|---|
| Authentication → Users | Email, securely hashed password, confirmation status (handled by Supabase) |
| `profiles` table | Full name, email and mobile number of each account |
| `applications` table | Each loan application: reference number, status, form answers, document list, status history |
| `notifications` table | Messages shown under the bell icon |
| `lenders` table | The 26 lender policies from the Excel sheet: bank names, rule numbers (min salary, CIBIL, age, FOIR, ROI…) and the full policy text. **Only bank names, no contact persons or phone numbers.** Signed-in users can read it but not change it. |
| Storage → `application-documents` | Uploaded PAN, Aadhaar, salary slips and other files (private) |

**Security:** Row Level Security is on for every table and the storage bucket, so a signed-in person can only read or change their own rows and files. Reference numbers, status history and notifications are written by the database itself, so they can't be faked from the browser.

---

## Setup (about 10 minutes)

### 1. Create a Supabase project
Go to https://supabase.com/dashboard and choose **New project**.
Use a **new, empty project** for this website. Don't reuse the project from the old loan portal: it already has tables with the same names. The setup script checks for this and stops.

### 2. Create the tables
In the project, open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.
It's safe to run again later.

### 2b. Load the bank policies
Open another **New query**, paste all of `supabase/lenders.sql`, and click **Run**. This creates the `lenders` table with the 26 policies and the `check_lenders` comparison.
You can correct or update any bank's rules later in **Table Editor → lenders**. The website uses the new values straight away.

### 3. Turn on email confirmation
Open **Authentication → Sign In / Providers → Email**. Make sure **Enable email provider** is on and **Confirm email** is **on**.

### 4. Tell Supabase your website address
Open **Authentication → URL Configuration**.
- **Site URL:** your website address, for example `https://loans.yourcompany.in`
- **Redirect URLs:** add your website with `/**` at the end, for example `https://loans.yourcompany.in/**`, and `http://localhost:3000/**` for testing on your computer.

The confirmation and reset links only work for addresses listed here.

### 5. Set up email sending (needed before real users sign up)
Supabase's built-in email sender is only for testing. It sends very few emails per hour.
For real use, open **Authentication → Emails → SMTP Settings** and connect an email service such as Brevo, Resend, Amazon SES or Zoho Mail. Many have free tiers.
Under **Email Templates → Confirm signup** you can change the email's wording and add your company name.

### 6. Connect the website to your project
In Supabase, open **Project Settings → API Keys** (or **API**) and copy:
- the **Project URL**
- the **publishable key** (called the "anon public" key in older projects)

Paste them into `public/js/config.js`:
```js
window.SUPABASE_URL = "https://abcdefghijk.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_...";
```
The publishable key is meant to be public. Never put the **service_role / secret** key in the website.

### 6b. Turn on the Gemini AI assistant
1. Get a Gemini API key from https://aistudio.google.com/app/apikey
2. In Supabase, open **Edge Functions → Secrets** and add `GEMINI_API_KEY` with your key. Optionally add `GEMINI_MODEL`, for example `gemini-2.5-flash`.
3. Deploy the function, either way:
   - **Dashboard:** Edge Functions → **Deploy a new function → Via editor**. Name it exactly **`bank-advisor`**, paste all of `supabase/functions/bank-advisor/index.ts`, then click **Deploy**.
   - **Command line:** `supabase functions deploy bank-advisor`
4. Leave **Verify JWT** on (the default). Only signed-in users can use the assistant.

The key stays on the server. The assistant only sees what the bank rules need (age, income, employer type, CIBIL, loan amount and so on). It never sees the person's name, phone, email, PAN, Aadhaar, address or employer name.
The bank eligibility list works without this step; only the AI explanation and chat need it.

### 7. Run it
- **On your computer:** install Node.js, then in this folder run `node server.js` and open http://localhost:3000
- **On the internet:** upload the **`public`** folder to any static web host, such as Netlify (drag and drop), Vercel, Cloudflare Pages or GitHub Pages. Then add that address in step 4.

---

## If something doesn't work

| What you see | What to do |
|---|---|
| "Connect Supabase" screen | Fill in `public/js/config.js` (step 6). |
| "Can't reach the server…" | Your network may be blocking `supabase.co`. Try a mobile hotspot, or change your DNS to 1.1.1.1 / 8.8.8.8. Also check the project isn't **Paused** in the Supabase dashboard. |
| No confirmation email | Check spam. Use **Resend** on the site. For more than a few sign-ups, set up SMTP (step 5). |
| The link opens the wrong website or shows an error | Add your site under **Redirect URLs** (step 4). |
| "That confirmation link has expired" | Links can only be used once. Sign in; if the email still isn't confirmed, resend the link. |
| The password reset link doesn't work | Open it in the same browser where you clicked "Forgot password". |
| "This Supabase project already has…" when running the SQL | Use a new, empty Supabase project (step 1). |
| Bank eligibility shows an error | Run `supabase/lenders.sql` (step 2b). |
| "The AI assistant isn't reachable" | Deploy the `bank-advisor` function (step 6b), with exactly that name. |
| "The AI assistant isn't set up yet" | Add the `GEMINI_API_KEY` secret (step 6b), then redeploy the function. |
| "The AI assistant is busy" | Your Gemini free-tier limit was reached. Wait a minute, or enable billing in Google AI Studio. |

To see who has registered, open **Authentication → Users** or the **Table Editor → profiles** table in Supabase.

## Change the look
- **Name and logo letters:** `public/js/config.js`
- **Colours (light and dark):** the top of `public/css/style.css`
- **Form fields:** `STEPS` in `public/js/shared.js`. If you add or remove a required field, also update `application_missing()` in `supabase/schema.sql`.

## Files
```
supabase/schema.sql    tables, security rules, storage bucket (run once in Supabase)
supabase/lenders.sql   the 26 bank policies from the Excel sheet + check_lenders() comparison (run second)
supabase/functions/bank-advisor/index.ts   Gemini assistant (Supabase Edge Function)
public/index.html      the page
public/js/config.js    Supabase URL + publishable key, site name
public/js/core.js      Supabase connection and data saving
public/js/shell.js     create account, email confirmation, sign in, layout, notifications
public/js/pages.js     dashboard, 6-step form, applications, EMI calculator, profile
public/js/banks.js     bank eligibility panel + AI assistant
public/js/shared.js    form steps, statuses, documents, EMI maths
public/css/style.css   styling (light and dark)
server.js              optional local web server
```

## About the bank rules
- The sheet describes **personal loan** policies. For other loan types, banks are marked "check with bank", and the reason says to confirm that bank's policy for the loan type.
- Numbers such as minimum salary, CIBIL, age, loan limits, FOIR and interest were read from the sheet's text. The full original text is kept in each lender's `policy` column. It's shown under **Show policy notes** and given to the AI assistant.
- Some banks have several columns in the sheet (different branches or desks). They appear as "HDFC Bank · Policy 1", "Policy 2" and so on. No contact persons are stored.
- A result is a guide, not an approval. The page always says so.
