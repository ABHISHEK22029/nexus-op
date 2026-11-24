/* ══════════════════════════════════════════════════════════
   bulk — one action over many records, saying first what will happen.

   From the agent portal's bulk actions: tick rows, and before anything
   changes see which will be done and which skipped and why; afterwards
   "3 done · 1 skipped: already sent".

   Two halves per action:
     check(id)  → null (not yours / not found), or { label, reason? }.
                  A reason means it would be skipped. Read-only; this is
                  all a dry run does.
     apply(id)  → runs the SAME route a single click runs (callRoute), so
                  every rule that guards one record guards the batch. If
                  that route refuses, the record is reported as skipped with
                  the route's own words — the preview can never promise
                  something the real rules then let through.
   ══════════════════════════════════════════════════════════ */
const MAX = 100;

/* The ids a request asked for: whole positive numbers, each once, at most
   MAX. Anything else is a 400, not a guess. */
function readIds(body) {
  const raw = Array.isArray(body?.ids) ? body.ids : null;
  if (!raw || !raw.length) return { error: 'Pick at least one record.' };
  const ids = [...new Set(raw.map(Number))];
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) return { error: 'Each id must be a record number.' };
  if (ids.length > MAX) return { error: `At most ${MAX} at a time.` };
  return { ids };
}

/* Run an Express route handler for one record, in-process, and hand back
   what it answered. The request inherits everything from the real one (the
   signed-in person, their company) through its prototype; only the record
   and the body change. */
function callRoute(handler, req, { params, body }) {
  return new Promise((resolve) => {
    const r = Object.create(req);
    r.params = params; r.body = body; r.query = {};
    let code = 200;
    const res = {
      headersSent: false,
      status(c) { code = c; return res; },
      json(b) { res.headersSent = true; resolve({ status: code, body: b }); return res; },
      send(b) { res.headersSent = true; resolve({ status: code, body: b }); return res; },
      sendStatus(c) { res.headersSent = true; resolve({ status: c, body: {} }); return res; },
      set() { return res; }, setHeader() { return res; }, type() { return res; },
    };
    Promise.resolve().then(() => handler(r, res))
      .catch(e => resolve({ status: 500, body: { error: e.message } }));
  });
}

async function runBulk(req, res, { check, apply }) {
  const { ids, error } = readIds(req.body);
  if (error) return res.status(400).json({ error });
  const dryRun = req.body?.dryRun === true;
  const done = [], skipped = [];
  try {
    /* one at a time: each apply locks its own row, and a batch of a
       hundred must not take every pooled connection at once */
    for (const id of ids) {
      const c = await check(id);
      if (!c) { skipped.push({ id, label: `#${id}`, reason: 'Not found' }); continue; }
      if (c.reason) { skipped.push({ id, label: c.label, reason: c.reason }); continue; }
      if (dryRun) { done.push({ id, label: c.label }); continue; }
      const r = await apply(id);
      if (r.status >= 400) skipped.push({ id, label: c.label, reason: r.body?.error || r.body?.detail || 'Refused' });
      else done.push({ id, label: c.label });
    }
    res.json({ dryRun, done, skipped });
  } catch (e) {
    console.error('bulk failed:', e.message);
    res.status(500).json({ error: "That didn't finish. Some records may have changed; reload to see where it got to.", done, skipped });
  }
}

module.exports = { runBulk, callRoute, readIds, MAX };
