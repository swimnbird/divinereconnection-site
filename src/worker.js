// divinereconnection.com — Worker in front of the static site.
// Routes handled here: /thank-you (post-purchase gift code) and /claim (friend redeems code).
// Everything else is served from ./public by the assets binding.

const STRIPE = "https://api.stripe.com/v1";
const COUPON = "COMPANION_GIFT";                       // 100% off, Standard product only
const CLAIM_LINK = "https://buy.stripe.com/6oUcN4gDB9OMeecdkm3ZK01"; // Standard (one place)
const GIFT_PRICES = new Set([
  "price_1UZtXLB5q6kLPMWo7jZH2oj1", // Early Bird (two places) £99
  "price_1UZtbQB5q6kLPMWoviiJprZv", // Companion Ticket (two places) £159
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/thank-you") return thankYou(url, env);
    if (url.pathname === "/claim") return claim(url);
    return env.ASSETS.fetch(request);
  },
};

// ---------- /thank-you ----------
async function thankYou(url, env) {
  const sid = url.searchParams.get("session_id") || "";
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)) return page(generic());
  if (!env.STRIPE_KEY) return page(generic("gift link not configured yet"), 200);

  const s = await stripe(env, `/checkout/sessions/${sid}?expand[]=line_items`);
  if (!s || s.error) return page(generic());
  if (s.payment_status !== "paid") return page(generic());

  const prices = (s.line_items?.data || []).map(li => li.price?.id);
  const eligible = prices.some(p => GIFT_PRICES.has(p));
  const buyer = s.customer_details?.name?.split(" ")[0] || "";
  if (!eligible) return page(thanksOnly(buyer));

  const code = await codeFor(sid, env);
  // Create (idempotent: same session always maps to the same code).
  let promo = await stripe(env, "/promotion_codes", {
    coupon: COUPON, code, max_redemptions: 1, active: true,
    "metadata[checkout_session]": sid,
    "metadata[buyer_email]": s.customer_details?.email || "",
    "metadata[buyer_name]": s.customer_details?.name || "",
  });
  if (promo?.error) {
    // Already minted for this session on an earlier page load.
    const list = await stripe(env, `/promotion_codes?code=${encodeURIComponent(code)}&limit=1`);
    promo = list?.data?.[0];
    if (!promo) return page(generic("we couldn't create the gift code — email Tyularose@gmail.com and we'll send it by hand"));
  }
  return page(giftPage(buyer, promo.code));
}

async function codeFor(sid, env) {
  // Deterministic, non-guessable code derived from the session id + secret.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sid)));
  const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
  let out = "";
  for (let i = 0; i < 8; i++) out += alpha[mac[i] % alpha.length];
  return `GIFT-${out.slice(0, 4)}-${out.slice(4)}`;
}

async function stripe(env, path, form) {
  const init = { headers: { Authorization: `Bearer ${env.STRIPE_KEY}` } };
  if (form) {
    init.method = "POST";
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(form).toString();
  }
  try {
    const r = await fetch(STRIPE + path, init);
    return await r.json();
  } catch { return null; }
}

// ---------- /claim ----------
function claim(url) {
  const code = (url.searchParams.get("code") || "").toUpperCase().trim();
  if (code && /^GIFT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    return Response.redirect(`${CLAIM_LINK}?prefilled_promo_code=${encodeURIComponent(code)}`, 302);
  }
  return page(claimPage(code));
}

// ---------- HTML ----------
function page(body, status = 200) {
  return new Response(shell(body), {
    status,
    headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function shell(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>UN-DO · Divine Reconnection</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:#fbf1d8;color:#2a1f0e;font-family:Inter,system-ui,sans-serif;font-size:17px;line-height:1.6}
.wrap{max-width:620px;margin:0 auto;padding:56px 24px 96px;text-align:center}
.disc{width:72px;height:72px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#f3dc93 0,#c8922c 55%,#86590c 100%);margin:0 auto 20px}
h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:44px;line-height:1.1;margin:0 0 14px;color:#2a1f0e}
.eyebrow{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#86590c;font-weight:600;margin:0 0 14px}
p{margin:0 0 16px}.muted{color:#6b5a3a;font-size:15px}
.card{background:#fff8e6;border:1px solid #e6d29c;border-radius:16px;padding:28px 24px;margin:28px 0}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;letter-spacing:.08em;color:#86590c;background:#fff;border:1.5px dashed #c8922c;border-radius:12px;padding:14px 18px;display:inline-block;margin:6px 0 14px;user-select:all}
.btn{display:inline-block;background:linear-gradient(180deg,#ecc973,#c8922c);color:#2a1f0e;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:999px;margin:6px;border:0;font:inherit;cursor:pointer}
.btn.alt{background:transparent;border:1.5px solid #c8922c;color:#86590c}
input{font:inherit;font-size:20px;letter-spacing:.08em;text-transform:uppercase;padding:12px 16px;border:1.5px solid #c8922c;border-radius:12px;width:min(100%,320px);text-align:center;background:#fff}
a{color:#86590c}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

function giftPage(buyer, code) {
  const claimUrl = `https://divinereconnection.com/claim?code=${encodeURIComponent(code)}`;
  const msg = `I've reserved you a place on UN-DO — a 33-day journey of presence starting 3 January. Claim your place here (it's already paid for): ${claimUrl}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  const mail = `mailto:?subject=${encodeURIComponent("A place on UN-DO, for you")}&body=${encodeURIComponent(msg)}`;
  return `
<div class="disc"></div>
<p class="eyebrow">Welcome to the circle</p>
<h1>${buyer ? esc(buyer) + ", your" : "Your"} place is reserved.</h1>
<p>A receipt is on its way to your inbox. On 1 January you'll receive the WhatsApp circle link and your UN-DO ebook, and we gather live on Zoom on <strong>Sunday 3 January at 12pm GMT</strong>.</p>
<div class="card">
  <p class="eyebrow" style="margin-bottom:6px">Your companion's place</p>
  <p>Give this code to the person you're walking the journey with. It's theirs alone and works once.</p>
  <div class="code" id="code">${esc(code)}</div>
  <div>
    <button class="btn" onclick="navigator.clipboard.writeText('${esc(code)}').then(()=>{this.textContent='Copied'})">Copy code</button>
    <a class="btn alt" href="${wa}" target="_blank" rel="noopener">Send on WhatsApp</a>
    <a class="btn alt" href="${mail}">Send by email</a>
  </div>
  <p class="muted" style="margin-top:14px">They claim it at <a href="${esc(claimUrl)}">divinereconnection.com/claim</a>. Keep this page or screenshot the code; we also have it on file if it's lost.</p>
</div>
<p class="muted">Questions? <a href="mailto:Tyularose@gmail.com">Tyularose@gmail.com</a> · With love, Tyula</p>`;
}

function thanksOnly(buyer) {
  return `
<div class="disc"></div>
<p class="eyebrow">Welcome to the circle</p>
<h1>${buyer ? esc(buyer) + ", your" : "Your"} place is reserved.</h1>
<p>A receipt is on its way to your inbox. On 1 January you'll receive the WhatsApp circle link and your UN-DO ebook, and we gather live on Zoom on <strong>Sunday 3 January at 12pm GMT</strong>.</p>
<p class="muted">Questions? <a href="mailto:Tyularose@gmail.com">Tyularose@gmail.com</a> · With love, Tyula</p>`;
}

function generic(note) {
  return `
<div class="disc"></div>
<p class="eyebrow">Thank you</p>
<h1>Your place is reserved.</h1>
<p>A receipt is on its way to your inbox, and we'll be in touch before 3 January with everything you need.</p>
${note ? `<p class="muted">(${esc(note)})</p>` : ""}
<p class="muted">Questions? <a href="mailto:Tyularose@gmail.com">Tyularose@gmail.com</a></p>`;
}

function claimPage(bad) {
  return `
<div class="disc"></div>
<p class="eyebrow">A gift of presence</p>
<h1>Claim your place on UN-DO.</h1>
<p>Someone who loves you has reserved you a place on a 33-day journey of presence, beginning <strong>3 January</strong>. Enter the code they sent you.</p>
<form class="card" method="get" action="/claim">
  <input name="code" placeholder="GIFT-XXXX-XXXX" value="${esc(bad)}" autocomplete="off" required>
  ${bad ? `<p class="muted" style="color:#a33">That doesn't look like a gift code — it should read GIFT-XXXX-XXXX.</p>` : ""}
  <div style="margin-top:14px"><button class="btn" type="submit">Claim my place</button></div>
  <p class="muted" style="margin-top:14px">You'll be taken to a secure checkout showing £0 to pay — just your name and email, so we can send you everything on 1 January.</p>
</form>
<p class="muted"><a href="/">About the journey</a> · <a href="mailto:Tyularose@gmail.com">Tyularose@gmail.com</a></p>`;
}
