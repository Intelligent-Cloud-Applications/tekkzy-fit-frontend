const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file) {
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
  loadEnv(path.join(__dirname, '..', '.env'));
  const base = 'https://3yn75zpn5m.execute-api.us-east-1.amazonaws.com/prod';
  const key = String(process.env.GYM_API_KEY || '').trim();
  const headers = {
    'X-Gym-Key': key,
    'X-Institution': 'Fitnessworld001',
    'Content-Type': 'application/json',
  };
  const settingsRes = await fetch(`${base}/settings`, { headers });
  const membersRes = await fetch(`${base}/members`, { headers });
  const paymentsRes = await fetch(`${base}/payments`, { headers });
  const membersJson = membersRes.ok ? await membersRes.json() : null;
  const paymentsJson = paymentsRes.ok ? await paymentsRes.json() : null;
  const count = (json) => (
    Array.isArray(json) ? json.length : json?.members?.length || json?.items?.length || json?.payments?.length || 0
  );
  console.log(JSON.stringify({
    settings: { status: settingsRes.status },
    members: { status: membersRes.status, count: count(membersJson) },
    payments: { status: paymentsRes.status, count: count(paymentsJson) },
  }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
