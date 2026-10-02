const fs = require('node:fs');
const path = require('node:path');
const Razorpay = require('razorpay');

const OLD_URL = 'https://3b0q8s76wk.execute-api.us-east-2.amazonaws.com/prod/webhooks/razorpay';
const NEW_URL = 'https://3yn75zpn5m.execute-api.us-east-1.amazonaws.com/prod/webhooks/razorpay';
const EVENTS = {
  'payment.captured': true,
  'payment.authorized': true,
  'payment_link.paid': true,
  'invoice.paid': true,
  'subscription.authenticated': true,
  'subscription.activated': true,
  'subscription.charged': true,
  'subscription.paused': true,
  'subscription.resumed': true,
  'subscription.cancelled': true,
  'subscription.halted': true,
  'subscription.pending': true,
  'subscription.completed': true,
  'subscription.updated': true,
};

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const key_id = String(process.env.RAZORPAY_LIVE_KEY_ID || '').trim();
  const key_secret = String(process.env.RAZORPAY_LIVE_SECRET_KEY || '').trim();
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET_LIVE || process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!key_id.startsWith('rzp_live_') || !key_secret || !secret) {
    throw new Error('Live Razorpay key and webhook secret are required');
  }

  const rzp = new Razorpay({ key_id, key_secret });
  const listed = await rzp.webhooks.all({ count: 50 });
  const items = listed.items || listed.webhooks || (Array.isArray(listed) ? listed : []);
  const existing = items.find((row) => row.url === OLD_URL || row.url === NEW_URL);
  const payload = {
    url: NEW_URL,
    alert_email: existing?.alert_email || 'admin@tekkzy.com',
    secret,
    events: { ...(existing?.events || {}), ...EVENTS },
  };
  const row = existing
    ? await rzp.webhooks.edit(payload, existing.id)
    : await rzp.webhooks.create(payload);
  const enabled = Object.keys(row.events || payload.events).filter((key) => row.events?.[key] || payload.events[key]);
  console.log(existing ? 'updated' : 'created', row.id, row.url, row.active, enabled.join(','));
}

main().catch((err) => {
  const body = err?.error || err?.message || err;
  console.error(typeof body === 'string' ? body : JSON.stringify(body));
  process.exit(1);
});
