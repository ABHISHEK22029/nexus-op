/* ══════════════════════════════════════════════════════════
   MetalPricesController — public metal rates for the Kirashi site.
   The static Kirashi homepage can't self-update, so the Nexus backend
   owns the data: it fetches the live USD→INR rate from MetalpriceAPI,
   converts maintained USD/kg base rates to INR/kg, and serves the result
   from a single-row DB cache. Refresh is LAZY (only when the cache is
   older than 12h) so it stays within the free-tier budget across restarts.
   Public — no auth, CORS open. Key: METALPRICEAPI_KEY (Render env).
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const REFRESH_HOURS = 12;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const CONFIG = {
  usdPerKg: { aluminium: 2.60, copper: 9.50, zinc: 2.80, tin: 32.0, nickel: 16.0, carbon_steel: 0.68, stainless_steel: 2.75 },
  alloys: { brass: { copper: 0.65, zinc: 0.35 }, bronze: { copper: 0.88, tin: 0.12 } },
  display: [
    { key: 'aluminium', label: 'Aluminium' },
    { key: 'copper', label: 'Copper' },
    { key: 'carbon_steel', label: 'Carbon Steel (MS)', note: 'indicative' },
    { key: 'stainless_steel', label: 'Stainless Steel', note: 'SS 304, indicative' },
    { key: 'brass', label: 'Brass', note: 'derived' },
    { key: 'bronze', label: 'Bronze', note: 'derived' },
  ],
  gstRate: 18,
  fallbackUsdInr: 95.0,
};

function nowIST() {
  const d = new Date(Date.now() + (5.5 * 60 - new Date().getTimezoneOffset()) * 60000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} IST`;
}

function build(usdInr, live, prevHistory) {
  const usd = { ...CONFIG.usdPerKg };
  const derived = {};
  for (const [name, mix] of Object.entries(CONFIG.alloys)) {
    derived[name] = Object.entries(mix).reduce((s, [m, f]) => s + (usd[m] || 0) * f, 0);
  }
  const usdOf = (k) => derived[k] ?? usd[k] ?? null;
  const metals = CONFIG.display.map((d) => {
    const v = usdOf(d.key);
    return { key: d.key, label: d.label, price: v != null ? round2(v * usdInr) : null, note: d.note || '' };
  });
  // per-day history (keep last 10)
  let history = Array.isArray(prevHistory) ? prevHistory : [];
  const todayKey = nowIST().slice(0, 10);
  const entry = { date: todayKey, metals: Object.fromEntries(metals.map((m) => [m.key, m.price])) };
  history = history.filter((h) => h.date !== todayKey).concat(entry).slice(-10);

  return {
    currency: 'INR', unit: 'per_kg', gst_rate: CONFIG.gstRate,
    last_updated: nowIST(), updated_epoch: Date.now(), usd_inr: round2(usdInr),
    provider_source: live ? 'MetalpriceAPI · USD→INR live' : 'config (fallback rate)',
    stale: !live,
    note: live ? 'INR converted live from USD base rates via USD→INR. Steel/alloys indicative.'
               : 'Fallback rate (live USD→INR unavailable). Base rates maintained in USD.',
    history, metals,
  };
}

async function fetchUsdInr() {
  const key = process.env.METALPRICEAPI_KEY;
  if (!key) throw new Error('no METALPRICEAPI_KEY');
  const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=INR`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || data.success === false || !data.rates || !data.rates.INR) {
    throw new Error(data && data.error ? data.error.message : 'no INR rate');
  }
  return data.rates.INR;
}

// GET /public/metal-prices
exports.get = async (req, res) => {
  try {
    const row = (await db.query('SELECT data, updated_at FROM metal_prices_cache WHERE id = 1')).rows[0];
    const ageMs = row?.updated_at ? Date.now() - new Date(row.updated_at).getTime() : Infinity;
    const fresh = row?.data && ageMs < REFRESH_HOURS * 3600 * 1000;

    if (fresh) return res.json(row.data);

    // Stale or empty → try a refresh (budget: only happens past 12h).
    try {
      const usdInr = await fetchUsdInr();
      const payload = build(usdInr, true, row?.data?.history);
      await db.query(
        `INSERT INTO metal_prices_cache (id, data, updated_at) VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [JSON.stringify(payload)]
      );
      return res.json(payload);
    } catch (e) {
      console.error('[metal-prices] refresh failed:', e.message);
      if (row?.data) return res.json(row.data);                       // serve last good cache
      const fallback = build(CONFIG.fallbackUsdInr, false, null);      // never-empty fallback
      return res.json(fallback);
    }
  } catch (e) {
    console.error('[metal-prices] endpoint error:', e.message);
    return res.json(build(CONFIG.fallbackUsdInr, false, null));
  }
};
