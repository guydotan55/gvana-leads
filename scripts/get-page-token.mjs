// scripts/get-page-token.mjs
// Mints a NON-EXPIRING Page access token for leadgen retrieval, working around
// the "can't move Page into business (IG-connected)" block.
//
// Provide ONE of these in .env.local:
//   (A) FB_LONG_USER_TOKEN   — a long-lived user token (from Graph Explorer + Token Debugger "Extend"); no app secret needed
//   (B) FB_SHORT_USER_TOKEN + FB_APP_ID + FB_APP_SECRET — a short token we exchange for a long-lived one
// Then: node scripts/get-page-token.mjs
// Writes the page token to ./fb-page-token.txt (gitignored) — never prints it.
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { writeFileSync } from "fs";

loadEnvConfig(process.cwd());

const GRAPH = "https://graph.facebook.com/v21.0";
const PAGE_ID = "557539187438900";        // מכינת גוונא Page
const TEST_FORM_ID = "859292457130080";   // תוכנית משתמטים form — leads_retrieval probe
const OUT = "fb-page-token.txt";

const longToken = process.env.FB_LONG_USER_TOKEN;
const shortToken = process.env.FB_SHORT_USER_TOKEN;
const appId = process.env.FB_APP_ID;
const appSecret = process.env.FB_APP_SECRET;

async function j(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(JSON.stringify(data.error || data));
  return data;
}

let userToken;
if (longToken) {
  userToken = longToken;
  console.log("✓ using the provided long-lived user token (no app secret needed)");
} else if (shortToken && appId && appSecret) {
  const ll = await j(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(shortToken)}`);
  userToken = ll.access_token;
  console.log("✓ exchanged short token for a long-lived user token (expires_in:", ll.expires_in ?? "n/a", ")");
} else {
  console.error("Provide FB_LONG_USER_TOKEN (preferred), OR FB_SHORT_USER_TOKEN + FB_APP_ID + FB_APP_SECRET, in .env.local");
  process.exit(1);
}

// Verify the USER token's lifetime + scopes (a token can debug itself — no app secret needed).
try {
  const meDbg = await j(`${GRAPH}/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(userToken)}`);
  const exp = meDbg.data?.expires_at;
  const scopes = meDbg.data?.scopes || [];
  const need = ["leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"];
  const missing = need.filter((s) => !scopes.includes(s));
  const days = exp ? Math.round((exp * 1000 - Date.now()) / 86400000) : null;
  console.log("user-token scopes:", scopes.join(", ") || "(none)");
  if (missing.length) console.log("⚠ user token is MISSING scopes:", missing.join(", "));
  console.log(`user-token expires_at: ${exp} ${exp === 0 ? "(never)" : days != null ? `(~${days} days)` : ""}`);
  if (days != null && days >= 0 && days <= 2) {
    console.log("⚠ This token looks SHORT-lived (≤2 days). Do the Token Debugger 'Extend Access Token' step and paste the longer token, or the Page token will also expire.");
  }
} catch (e) { console.log("(user-token debug skipped:", e.message, ")"); }

// Page token from a long-lived user token → this page token does NOT expire.
const accounts = await j(`${GRAPH}/me/accounts?fields=name,access_token,id&limit=200&access_token=${encodeURIComponent(userToken)}`);
const page = (accounts.data || []).find((p) => p.id === PAGE_ID);
if (!page) {
  console.error(`✗ Page ${PAGE_ID} not in /me/accounts — you must be an admin of it. Pages seen: ` +
    ((accounts.data || []).map((p) => `${p.name}(${p.id})`).join(", ") || "(none)"));
  process.exit(1);
}
const pageToken = page.access_token;
console.log(`✓ got Page token for "${page.name}" (${page.id}); length ${pageToken.length}`);

// Inspect the PAGE token's expiry (app token if we have the secret, else the user token as inspector).
try {
  const inspector = (appId && appSecret) ? `${appId}|${appSecret}` : userToken;
  const dbg = await j(`${GRAPH}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(inspector)}`);
  console.log("✓ page-token scopes:", (dbg.data?.scopes || []).join(", ") || "(none)");
  console.log("page-token expires_at:", dbg.data?.expires_at,
    dbg.data?.expires_at === 0 ? "(NEVER — this is the permanent token we want ✅)" : "(has an expiry!)");
} catch (e) { console.log("(page-token expiry check skipped:", e.message, ")"); }

// read-only leads_retrieval probe (no PII printed)
try {
  const forms = await j(`${GRAPH}/${PAGE_ID}/leadgen_forms?fields=id,name&limit=10&access_token=${encodeURIComponent(pageToken)}`);
  console.log(`✓ lead forms visible on the page: ${forms.data?.length ?? 0}`);
  const lead = await j(`${GRAPH}/${TEST_FORM_ID}/leads?fields=created_time&limit=1&access_token=${encodeURIComponent(pageToken)}`);
  console.log(`✓ leads_retrieval WORKS — read ${lead.data?.length ?? 0} lead(s) (metadata only, no PII shown)`);
} catch (e) {
  console.log("⚠ leads_retrieval probe FAILED:", e.message);
}

writeFileSync(OUT, pageToken + "\n");
console.log(`\n✓ Page token written to ./${OUT} (gitignored).`);
console.log("  → paste its contents into Vercel as FB_PAGE_ACCESS_TOKEN, then delete the file.");
