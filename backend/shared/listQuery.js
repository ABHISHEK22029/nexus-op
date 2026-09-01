/* ══════════════════════════════════════════════════════════
   listQuery — one place that turns ?search / ?filter / ?sort /
   ?limit / ?offset into safe SQL for any list endpoint.

   Why this exists: every list endpoint returned its ENTIRE table with no
   LIMIT, no server-side search and no pagination. At 20 rows that is
   invisible; at 20,000 the server serialises everything, the browser holds
   everything, and the handful of pages with a search box filter that array
   client-side. It degrades from a few thousand rows.

   Two safety rules baked in:
     1. Column names are NEVER taken from user input — callers pass explicit
        whitelists. Only VALUES are parameterised into the query.
     2. Even a caller that asks for no pagination gets a hard cap, so no
        endpoint can ever stream an unbounded table.

   Backwards compatible by design: without a `limit` param the endpoint
   still returns a plain array, exactly as before. Pass `limit` and you get
   { items, total, limit, offset } instead.
   ══════════════════════════════════════════════════════════ */

const MAX_LIMIT = 200;   // largest page a client may request
const HARD_CAP = 1000;   // ceiling when the caller asks for no pagination

/** Quote an identifier so camelCase columns like "projectId" survive. */
const q = (col) => `"${String(col).replace(/"/g, '')}"`;

/**
 * @param {object}   o
 * @param {string}   o.table           table (or "table alias" / join clause)
 * @param {object}   o.query           req.query
 * @param {string[]} o.searchColumns   columns ?search scans (ILIKE, OR'd)
 * @param {string[]} o.filterColumns   columns accepted as exact-match filters
 * @param {string[]} o.allowedSort     columns ?sort may use
 * @param {string}   o.defaultSort     fallback sort column
 * @param {string}   o.defaultDir      'ASC' | 'DESC'
 * @param {string[]} o.where           extra WHERE fragments (already $n-safe)
 * @param {any[]}    o.params          params matching those fragments
 * @param {string}   o.select          SELECT list (default '*')
 */
function buildListQuery({
  table, query = {}, searchColumns = [], filterColumns = [],
  allowedSort = [], defaultSort = 'id', defaultDir = 'ASC',
  where = [], params = [], select = '*',
}) {
  const clauses = [...where];
  const values = [...params];
  let n = values.length;

  // ── free-text search across the caller's chosen columns ──
  const term = String(query.search ?? query.q ?? '').trim();
  if (term && searchColumns.length) {
    n += 1;
    values.push(`%${term}%`);
    clauses.push('(' + searchColumns.map(c => `${q(c)}::text ILIKE $${n}`).join(' OR ') + ')');
  }

  // ── exact-match filters (status, type, category …) ──
  for (const col of filterColumns) {
    const v = query[col];
    if (v !== undefined && v !== null && v !== '') {
      n += 1;
      values.push(v);
      clauses.push(`${q(col)} = $${n}`);
    }
  }

  const whereSql = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';

  // ── sort (whitelisted column only) ──
  const sortCol = allowedSort.includes(query.sort) ? query.sort : defaultSort;
  const dir = String(query.dir ?? '').toLowerCase() === 'desc' ? 'DESC'
    : String(query.dir ?? '').toLowerCase() === 'asc' ? 'ASC'
      : defaultDir;
  const orderSql = sortCol ? ` ORDER BY ${q(sortCol)} ${dir}` : '';

  // ── pagination ──
  const wantsPage = query.limit !== undefined && query.limit !== '';
  const limit = wantsPage
    ? Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), MAX_LIMIT)
    : HARD_CAP;
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);

  return {
    wantsPage,
    limit,
    offset,
    sql: `SELECT ${select} FROM ${table}${whereSql}${orderSql} LIMIT ${limit} OFFSET ${offset}`,
    countSql: `SELECT COUNT(*)::int AS total FROM ${table}${whereSql}`,
    values,
  };
}

/**
 * Run the query and shape the response.
 * Returns a plain array when the caller didn't ask for pagination (so every
 * existing page keeps working), or { items, total, limit, offset } when it did.
 */
async function runList(db, opts) {
  const built = buildListQuery(opts);
  const { rows } = await db.query(built.sql, built.values);
  if (!built.wantsPage) return rows;
  const { rows: c } = await db.query(built.countSql, built.values);
  return { items: rows, total: c[0]?.total ?? rows.length, limit: built.limit, offset: built.offset };
}

module.exports = { buildListQuery, runList, MAX_LIMIT, HARD_CAP };
