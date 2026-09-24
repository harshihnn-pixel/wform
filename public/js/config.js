/* config.js — your settings.
   SUPABASE_URL and the publishable (anon) key are meant to be public: they are safe in the browser
   because Row Level Security in the database decides what each signed-in person can see.
   NEVER put the service_role / secret key here.
   Find them in Supabase → Project Settings → API (or "API Keys"). */
window.SUPABASE_URL = "https://koomaawoklxieznbcnwr.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_DNfyWsqxiq5Bua1W2pEwkw_Nzwz3hpK";

/* Optional: the public address of this website, used in confirmation and reset emails.
   Leave empty to use the address the page is opened from. Example: "https://loans.example.in/" */
window.SITE_URL = " http://localhost:3000";

var BRAND = {
  name: "Loan Portal",
  short: "LP",
  tagline: "Simple loan applications"
};
