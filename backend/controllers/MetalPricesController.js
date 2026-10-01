/* ══════════════════════════════════════════════════════════
   MetalPricesController — public metal rates for the Kirashi site.
   The static Kirashi homepage can't self-update, so the Nexus backend
   owns the data: it fetches the live USD→INR rate from MetalpriceAPI,
   converts maintained USD/kg base rates to INR/kg, and serves the result
   from a single-row DB cache. Refresh is LAZY (only when the cache is
   older than 12h) so it stays within the free-tier budget across restarts.
   Public — no auth, CORS open. Key: METALPRICEAPI_KEY (Render env).

   ── What is actually live, and what is not ─────────────────────────────
   Worth being plain about, because the chart on the site makes these look
   like market prices and only one number in here is observed:

     · USD→INR .............. live from the provider
     · usdPerKg{} ........... MAINTAINED CONSTANTS, edited by hand
     · inrPerKg{} ........... MAINTAINED CONSTANTS, edited by hand
     · brass / bronze ....... derived from the constants above

   So every USD-based metal is one constant times one exchange rate. They
   all move by the same percentage on the same day — a check against the
   live data showed the copper/aluminium ratio constant to four decimals
   across ten days, and MS Channel identical on every one of them.

   Real per-metal prices (ALU, XCU, ZNC, NI, XPB, XSN, IRON) exist in the
   provider's catalogue but return 416 "requires a paid plan" on this key,
   as does any history older than 30 days. Until that changes, the honest
   position is that this endpoint publishes INDICATIVE rates derived from
   an FX rate, and `basis` in the response says so rather than leaving the
   page to imply otherwise.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const REFRESH_HOURS = 12;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* How much history to keep, and to serve — the same number, because there is
   no reason to hold a day nobody can look at.

   366, not 365: the chart's 1Y range asks for 365 days BACK FROM TODAY, so a
   span of exactly 365 days is needed for it to be fully covered. Keeping 365
   rows gives a span of 364 and the 1Y view would permanently report itself as
   truncated ("since 2 Oct 2025") instead of "past year". One spare day costs
   nothing and makes the longest range honest. Leap years are covered too. */
const HISTORY_DAYS = 366;

/* How far back the provider lets this key reach in one timeframe call.
   Older than 30 days returns 209 "requires a paid plan". */
const BACKFILL_DAYS = 30;

const CONFIG = {
  usdPerKg: { aluminium: 2.60, copper: 9.50, zinc: 2.80, tin: 32.0, nickel: 16.0, carbon_steel: 0.68, stainless_steel: 2.75 },
  // INR-native maintained rates (₹/kg) — served directly, NO USD conversion.
  // Raipur re-rolled steel; indicative — UPDATE WEEKLY here.
  inrPerKg: { ms_channel: 51, ms_flat: 52 },
  /* When the hand-maintained rates above were last reviewed. This is published
     in the response because the two Raipur rates are the ones a fabricator
     would actually act on, they are the only series that never moves on its
     own, and "indicative" alone does not tell anybody the number is six weeks
     old. Update this on the same edit as the rates. */
  maintainedOn: '2026-08-17',
  alloys: { brass: { copper: 0.65, zinc: 0.35 }, bronze: { copper: 0.88, tin: 0.12 } },
  display: [
    { key: 'ms_channel', label: 'MS Channel (Raipur)', note: 're-rolled · indicative' },
    { key: 'ms_flat', label: 'MS Flat (Raipur)', note: 're-rolled · indicative' },
    { key: 'carbon_steel', label: 'Carbon Steel (MS)', note: 'indicative' },
    { key: 'stainless_steel', label: 'Stainless Steel', note: 'SS 304, indicative' },
    { key: 'aluminium', label: 'Aluminium' },
    { key: 'copper', label: 'Copper' },
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
const todayIST = () => nowIST().slice(0, 10);

/* ── prices ─────────────────────────────────────────────────────────────
   Split out from the response assembly: the backfill needs the metals for
   an arbitrary past FX rate without building a whole payload, and the old
   combined function also mutated history as a side effect, which is how
   the 10-day truncation ended up buried inside a price calculation. */
function metalsAt(usdInr, { includeMaintained = true } = {}) {
  const usd = { ...CONFIG.usdPerKg };
  const derived = {};
  for (const [name, mix] of Object.entries(CONFIG.alloys)) {
    derived[name] = Object.entries(mix).reduce((s, [m, f]) => s + (usd[m] || 0) * f, 0);
  }
  const usdOf = (k) => derived[k] ?? usd[k] ?? null;
  const inr = CONFIG.inrPerKg || {};
  return CONFIG.display.map((d) => {
    const isMaintained = inr[d.key] != null;
    /* A backfilled day omits the hand-maintained rates rather than guessing
       them. We know what MS Channel is quoted at today because somebody
       typed it; we have no record of what it was three weeks ago, and
       carrying today's 51 backwards would draw a flat line that asserts a
       price nobody observed. The chart skips days where a metal is absent,
       so those two series are simply shorter than the rest. */
    if (isMaintained && !includeMaintained) return null;
    const price = isMaintained
      ? round2(inr[d.key])                                     // INR-native (maintained ₹/kg)
      : (usdOf(d.key) != null ? round2(usdOf(d.key) * usdInr) : null);
    return {
      key: d.key, label: d.label, price,
      price_tonne: price != null ? round2(price * 1000) : null,
      note: d.note || '',
    };
  }).filter(Boolean);
}

function build(usdInr, live, history) {
  const metals = metalsAt(usdInr);
  return {
    currency: 'INR', unit: 'per_kg', gst_rate: CONFIG.gstRate,
    last_updated: nowIST(), updated_epoch: Date.now(), usd_inr: round2(usdInr),
    provider_source: live ? 'MetalpriceAPI · USD→INR live' : 'config (fallback rate)',
    stale: !live,
    /* Named so the page can stop implying price discovery that is not
       happening. Only the FX rate is observed; the per-kg bases are not. */
    basis: 'fx_derived',
    maintained_on: CONFIG.maintainedOn,
    note: live ? 'INR converted live from USD base rates via USD→INR. Steel/alloys indicative.'
               : 'Fallback rate (live USD→INR unavailable). Base rates maintained in USD.',
    history: Array.isArray(history) ? history : [],
    metals,
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

/* ── history ────────────────────────────────────────────────────────────
   One row per day in metal_price_history (migration 062). Every read and
   write tolerates the table being absent, because Render deploys code and
   migrations are run by hand — a deploy that lands first must degrade to
   serving today's prices with no chart, not 500 the Kirashi homepage. */
let historyTableMissing = false;
const isMissingTable = (e) => e && e.code === '42P01';

async function readHistory() {
  if (historyTableMissing) return [];
  try {
    const { rows } = await db.query(
      `SELECT day, metals, source FROM metal_price_history
       ORDER BY day DESC LIMIT $1`, [HISTORY_DAYS]);
    /* db.js parses DATE (oid 1082) to the raw 'YYYY-MM-DD' string, so `day`
       needs no formatting — and must not be put through a JS Date, which is
       what turns a calendar day into the day before for IST readers. */
    return rows.reverse().map((r) => ({ date: r.day, metals: r.metals, source: r.source }));
  } catch (e) {
    if (isMissingTable(e)) { historyTableMissing = true; console.warn('[metal-prices] metal_price_history missing — run migration 062'); return []; }
    console.error('[metal-prices] history read failed:', e.message);
    return [];
  }
}

/* Drop anything past the retention window.

   Once per process, not per request: this endpoint is hit on every view of
   the Kirashi rates page, and a DELETE per page view is write load on a
   hosted database to remove, almost always, nothing. The table is capped at
   366 rows, so over-retaining for a few hours after a restart is harmless —
   whereas a write on every read is not.

   CURRENT_DATE is the database's date (UTC) while the day keys are IST, so
   the cutoff can land a day either side. On a 366-day window that is
   immaterial, and erring a day long is the safe direction. */
let pruned = false;
async function pruneHistory() {
  if (pruned || historyTableMissing) return 0;
  pruned = true;
  try {
    const { rowCount } = await db.query(
      'DELETE FROM metal_price_history WHERE day < (CURRENT_DATE - $1::int)', [HISTORY_DAYS]);
    if (rowCount) console.log(`[metal-prices] pruned ${rowCount} day(s) older than ${HISTORY_DAYS} days`);
    return rowCount;
  } catch (e) {
    if (isMissingTable(e)) { historyTableMissing = true; return 0; }
    console.error('[metal-prices] prune failed:', e.message);
    return 0;
  }
}

/* Today's observation. Overwrites itself through the day — a later call has
   a fresher FX rate for the same date — and overwrites a backfilled row,
   because an observed day beats a reconstructed one. */
async function recordToday(day, metals, usdInr, live) {
  if (historyTableMissing) return;
  try {
    await db.query(
      `INSERT INTO metal_price_history (day, metals, usd_inr, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (day) DO UPDATE
         SET metals = EXCLUDED.metals, usd_inr = EXCLUDED.usd_inr, source = EXCLUDED.source`,
      [day, JSON.stringify(Object.fromEntries(metals.map((m) => [m.key, m.price]))),
       round2(usdInr), live ? 'live' : 'fallback']);
  } catch (e) {
    if (isMissingTable(e)) { historyTableMissing = true; return; }
    console.error('[metal-prices] history write failed:', e.message);
  }
}

/* ── remembering what has already been tried ────────────────────────────
   metal_price_meta (migration 062). See backfillFx for why this has to
   survive a restart rather than living in a module variable. */
async function metaGet(key) {
  try {
    const { rows } = await db.query('SELECT value FROM metal_price_meta WHERE key = $1', [key]);
    return rows[0]?.value || null;
  } catch (e) { if (!isMissingTable(e)) console.error('[metal-prices] meta read:', e.message); return null; }
}
async function metaSet(key, value) {
  try {
    await db.query(
      `INSERT INTO metal_price_meta (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]);
  } catch (e) { if (!isMissingTable(e)) console.error('[metal-prices] meta write:', e.message); }
}

/* ── backfill ───────────────────────────────────────────────────────────
   The chart offered 3M, 1Y and 3Y against ten days of data. Thirty days is
   as far as this key reaches, so thirty days is the most the chart can
   honestly show; the longer ranges stay hidden until the days accrue.

   Two limits on the free plan shape this, both found by asking rather than
   by reading: history older than 30 days is refused (209), and a single
   timeframe query may span at most 5 days (also 209). So a month costs six
   calls, which is why the result is written down — a plan limit will not
   resolve itself, and retrying it on every cold start would spend the
   monthly budget discovering the same refusal.

   DO NOTHING on conflict: a reconstructed day must never overwrite one that
   was actually observed. */
const CHUNK_DAYS = 5;            // the free plan's per-query span
const MAX_ATTEMPTS = 3;
let backfilled = false;

async function backfillFx() {
  if (backfilled || historyTableMissing) return 0;
  backfilled = true;
  const key = process.env.METALPRICEAPI_KEY;
  if (!key) return 0;

  const mark = (await metaGet('fx_backfill')) || {};
  if (mark.complete) return 0;
  if ((mark.attempts || 0) >= MAX_ATTEMPTS) return 0;

  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM metal_price_history');
  if (rows[0].n >= 14) {
    await metaSet('fx_backfill', { complete: true, reason: 'enough history already recorded' });
    return 0;
  }

  const ymd = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  let written = 0, calls = 0, stop = null;

  /* Oldest window first, so an interruption leaves a contiguous recent run
      rather than islands with holes between them. */
  for (let back = BACKFILL_DAYS - 1; back >= 0 && !stop; back -= CHUNK_DAYS) {
    const from = new Date(today.getTime() - back * 864e5);
    const to = new Date(Math.min(today.getTime(), from.getTime() + (CHUNK_DAYS - 1) * 864e5));
    const url = `https://api.metalpriceapi.com/v1/timeframe?api_key=${key}`
      + `&start_date=${ymd(from)}&end_date=${ymd(to)}&base=USD&currencies=INR`;

    let data = null, httpOk = false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      httpOk = res.ok;
      data = await res.json().catch(() => null);
    } catch (e) { stop = { transient: true, reason: e.message }; break; }
    calls++;

    if (!data || data.success === false || !data.rates) {
      const msg = data?.error?.message || data?.message || `HTTP ${httpOk ? 200 : 'error'}`;
      /* A plan refusal is permanent. Anything else might be a bad minute. */
      const permanent = /paid plan|not allowed|subscription|upgrade/i.test(msg);
      stop = { transient: !permanent, reason: msg };
      break;
    }

    for (const [day, rate] of Object.entries(data.rates)) {
      const inr = rate && (rate.INR ?? rate.inr);
      if (!inr || !isFinite(inr)) continue;
      /* FX-derived metals only — see metalsAt(). */
      const metals = metalsAt(inr, { includeMaintained: false });
      const r = await db.query(
        `INSERT INTO metal_price_history (day, metals, usd_inr, source)
         VALUES ($1, $2, $3, 'backfill') ON CONFLICT (day) DO NOTHING`,
        [day, JSON.stringify(Object.fromEntries(metals.map((m) => [m.key, m.price]))), round2(inr)]);
      written += r.rowCount;
    }
  }

  if (stop && stop.transient) {
    await metaSet('fx_backfill', { complete: false, attempts: (mark.attempts || 0) + 1, last_error: stop.reason, days: written });
    console.warn(`[metal-prices] backfill stopped after ${calls} call(s), ${written} day(s) written: ${stop.reason}`);
  } else {
    await metaSet('fx_backfill', {
      complete: true, days: written, calls,
      reason: stop ? `provider refused: ${stop.reason}` : 'completed',
    });
    console.log(`[metal-prices] backfilled ${written} day(s) in ${calls} call(s)${stop ? ` — stopped: ${stop.reason}` : ''}`);
  }
  return written;
}

// GET /public/metal-prices
exports.get = async (req, res) => {
  try {
    const row = (await db.query('SELECT data, updated_at FROM metal_prices_cache WHERE id = 1')).rows[0];
    const cached = row?.data || null;
    const ageMs = row?.updated_at ? Date.now() - new Date(row.updated_at).getTime() : Infinity;
    const fresh = cached && ageMs < REFRESH_HOURS * 3600 * 1000;

    /* One attempt per process, and never at the cost of the response: a
       backfill failure leaves the chart short, which is the state it was
       already in, so it is logged rather than surfaced. */
    try { await backfillFx(); } catch (e) { console.error('[metal-prices] backfill failed:', e.message); }
    await pruneHistory();

    // Fresh cache: reuse the cached USD→INR (no API call) but REBUILD metals from the
    // CURRENT config, so maintained ₹/kg rates (e.g. weekly Raipur steel) reflect at once.
    if (fresh) {
      const usdInr = cached.usd_inr || CONFIG.fallbackUsdInr;
      const live = !cached.stale;
      /* Still record the day. The old code only wrote history on the stale
         path, so a day whose first visit fell inside the 12h window was
         never recorded at all — which is why ten recorded days spanned
         fifteen calendar ones. */
      await recordToday(todayIST(), metalsAt(usdInr), usdInr, live);
      return res.json(build(usdInr, live, await readHistory()));
    }

    // Stale or empty → refresh the USD→INR rate (budget: at most once / 12h).
    try {
      const usdInr = await fetchUsdInr();
      await recordToday(todayIST(), metalsAt(usdInr), usdInr, true);
      const payload = build(usdInr, true, await readHistory());
      /* The cache row is now only the current snapshot and the provider-call
         clock. History lives in its own table; writing it here too would be
         a second source of truth that drifts. */
      await db.query(
        `INSERT INTO metal_prices_cache (id, data, updated_at) VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [JSON.stringify({ ...payload, history: undefined })]
      );
      return res.json(payload);
    } catch (e) {
      console.error('[metal-prices] refresh failed:', e.message);
      const usdInr = cached?.usd_inr || CONFIG.fallbackUsdInr;
      return res.json(build(usdInr, false, await readHistory()));
    }
  } catch (e) {
    console.error('[metal-prices] endpoint error:', e.message);
    return res.json(build(CONFIG.fallbackUsdInr, false, []));
  }
};
