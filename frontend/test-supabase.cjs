const { Client } = require('pg');

const user = 'postgres.xkopxriicqxwgvbwbzdk';
const pass = 'NexusOP202412';

const tests = [
  // Transaction pooler (port 6543) — ap-northeast-1 (Tokyo)
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 6543, user, label: 'TX Pooler Tokyo :6543' },
  // Session pooler (port 5432) — ap-northeast-1
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 5432, user, label: 'Session Pooler Tokyo :5432' },
  // Try with plain postgres user on pooler
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 5432, user: 'postgres', label: 'Pooler Tokyo plain user' },
  { host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 6543, user: 'postgres', label: 'Pooler Tokyo plain user :6543' },
  // Alternative Supabase pooler formats
  { host: 'db.xkopxriicqxwgvbwbzdk.supabase.co', port: 6543, user, label: 'Direct host :6543' },
  { host: 'db.xkopxriicqxwgvbwbzdk.supabase.co', port: 5432, user: 'postgres', label: 'Direct host plain user' },
];

async function test({ host, port, user: u, label }) {
  const c = new Client({
    host, port, database: 'postgres', user: u, password: pass,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000
  });
  try {
    await c.connect();
    const r = await c.query('SELECT current_database(), version()');
    console.log(`✅ SUCCESS: ${label}`);
    console.log(`   DB: ${r.rows[0].current_database}, ${r.rows[0].version.substring(0,40)}`);
    await c.end();
    return true;
  } catch (e) {
    console.log(`❌ FAIL:    ${label} → ${e.message.substring(0, 90)}`);
    return false;
  }
}

async function main() {
  console.log('Testing all connection variants...\n');
  for (const t of tests) {
    const ok = await test(t);
    if (ok) { console.log(`\n🎯 WORKING CONFIG FOUND: host=${t.host} port=${t.port} user=${t.user}`); }
  }
}
main();
