/* server.js — optional local web server:   node server.js   → http://localhost:3000
   The website itself is static (HTML/CSS/JS) and talks to Supabase directly, so you can also
   host the "public" folder on Netlify, Vercel, Cloudflare Pages, GitHub Pages or any web host. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
http.createServer((req, res) => {
  Object.entries(HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  let urlPath = decodeURI(new URL(req.url, "http://x").pathname);
  let file = path.normalize(path.join(PUBLIC, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=300" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log("Loan Portal running at http://localhost:" + PORT));
