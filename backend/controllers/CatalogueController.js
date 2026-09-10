/* ══════════════════════════════════════════════════════════════════════
   The public catalogue, and the enquiries it produces.

   Two audiences in one file, and the split matters:

     · the `public*` handlers answer a STRANGER with no token at all. They
       run before app.use(authenticate). Everything they return is decided
       by one thing — publication. If a business has not published its
       catalogue, and published the individual product, nothing comes back.

     · the rest answer the business, behind the usual auth and owner
       scoping.

   Publication is the authorisation. That is the whole security model here,
   so it is applied in the SQL of every public query rather than checked
   afterwards in JavaScript, where a later edit can forget it.
   ══════════════════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { profileFor } = require('../shared/companyProfile');
const { notify } = require('../notify');

const ownerOf = (req) => req.user?.orgId ?? req.user?.id ?? null;

/* A slug is part of a URL people paste into WhatsApp. Keep it to things
   that survive that trip: lower case, digits, hyphens. */
const cleanSlug = (s) => String(s || '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60);

/* ══════════════════════════════════════════════════════════════════════
   PUBLIC — no token, no session, no cookies
   ══════════════════════════════════════════════════════════════════════ */

/* GET /public/catalogue/:slug — the shop front.
   404 for "no such slug", for "not published", and for a published
   catalogue belonging to a business that has since unpublished it. A
   stranger cannot tell those apart, and should not be able to: a
   distinguishable response turns this into a directory of who is on the
   platform. */
exports.publicCatalogue = async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    if (!slug) return res.status(404).json({ error: 'Catalogue not found' });

    /* The settings and the business's identity in one round trip. They are
       both keyed on the same owner, and this is the first thing a
       visitor's browser waits on — a separate profile lookup was a second
       trip to Mumbai for four columns.
     *
       The company columns are named explicitly and narrowly. company_profile
       also holds a GSTIN and a bank account number, and this response is
       public; a SELECT * here would put them on the internet. */
    const { rows: [cat] } = await db.query(
      `SELECT cs.owner_id, cs.slug, cs.headline, cs.subhead, cs.show_prices,
              cs.whatsapp_number, cs.theme_accent,
              cp.name AS co_name, cp."tradeName" AS co_trade, cp.logo_url AS co_logo,
              cp.website AS co_website, cp.phone AS co_phone, cp.email AS co_email
         FROM catalogue_settings cs
         LEFT JOIN company_profile cp ON cp.owner_id = cs.owner_id
        WHERE LOWER(cs.slug) = $1 AND cs.is_published IS TRUE`, [slug]);
    if (!cat) return res.status(404).json({ error: 'Catalogue not found' });

    const company = cat.co_name ? {
      name: cat.co_name, tradeName: cat.co_trade, logo_url: cat.co_logo,
      website: cat.co_website, phone: cat.co_phone, email: cat.co_email,
    } : null;

    /* Paginated and searchable. A fabricator's catalogue is not six things
       — the sample this was built against runs to a hundred — and sending
       all of them to a phone on a site connection is the difference
       between a page that opens and one that does not. */
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 60);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const q = String(req.query.q || '').trim().slice(0, 80);

    const params = [cat.owner_id];
    let search = '';
    if (q) {
      params.push(`%${q}%`);
      search = ` AND (s.name ILIKE $${params.length} OR s.headline ILIKE $${params.length}
                      OR s.use_case ILIKE $${params.length} OR s.sku_code ILIKE $${params.length})`;
    }
    const base = `FROM skus s
      WHERE s.owner_id = $1 AND s.is_published IS TRUE
        AND s.catalogue_slug IS NOT NULL${search}`;

    /* COUNT(*) OVER() rather than a second query. The total and the page
       come back together, which halves the round trips — and on the public
       page that is the difference a visitor actually feels, because it is
       the first thing their browser waits for. */
    const rowParams = [...params, !!cat.show_prices, limit, offset];
    const { rows } = await db.query(
      `SELECT s.id, s.catalogue_slug AS slug, s.name, s.headline, s.use_case,
              s.unit, s.moq, s.lead_time_note, s.sort_order,
              CASE WHEN $${params.length + 1} THEN s.price ELSE NULL END AS price,
              (SELECT cp.id FROM catalogue_photos cp
                WHERE cp.sku_id = s.id ORDER BY cp.sort_order, cp.id LIMIT 1) AS photo_id,
              COUNT(*) OVER()::int AS total_count
       ${base}
        ORDER BY s.sort_order, s.name
        LIMIT $${params.length + 2} OFFSET $${params.length + 3}`,
      rowParams);

    /* Zero rows means zero rows — the window function has nothing to
       report from, so an empty page past the end says 0 rather than the
       real total. Only matters for a request that asks beyond the last
       page, which the UI does not do. */
    const total = rows.length ? rows[0].total_count : 0;
    const products = rows.map(({ total_count, ...p }) => p);

    /* How big the catalogue is, as opposed to how many matched a search.
       The hero reads "N products listed", which is a statement about the
       business — searching for "cross arm" should not make it claim they
       only make five things. Only costs a query when a search is running;
       without one the two numbers are the same. */
    let catalogueTotal = total;
    if (q) {
      const { rows: [all] } = await db.query(
        `SELECT COUNT(*)::int AS n FROM skus s
          WHERE s.owner_id = $1 AND s.is_published IS TRUE AND s.catalogue_slug IS NOT NULL`,
        [cat.owner_id]);
      catalogueTotal = all.n;
    }

    res.json({
      slug: cat.slug,
      headline: cat.headline,
      subhead: cat.subhead,
      showPrices: !!cat.show_prices,
      whatsapp: cat.whatsapp_number,
      accent: cat.theme_accent,
      company: company ? {
        name: company.name, tradeName: company.tradeName,
        logo: company.logo_url, website: company.website,
        phone: company.phone, email: company.email,
      } : null,
      products,
      total, catalogueTotal, limit, offset, q,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* GET /public/catalogue/:slug/:productSlug — one product. */
exports.publicProduct = async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const productSlug = cleanSlug(req.params.productSlug);
    if (!slug || !productSlug) return res.status(404).json({ error: 'Not found' });

    const { rows: [cat] } = await db.query(
      `SELECT owner_id, show_prices FROM catalogue_settings
        WHERE LOWER(slug) = $1 AND is_published IS TRUE`, [slug]);
    if (!cat) return res.status(404).json({ error: 'Not found' });

    const { rows: [p] } = await db.query(
      `SELECT s.id, s.catalogue_slug AS slug, s.name, s.headline, s.description,
              s.use_case, s.unit, s.moq, s.lead_time_note, s.hsn,
              CASE WHEN $3 THEN s.price ELSE NULL END AS price
         FROM skus s
        WHERE s.owner_id = $1 AND LOWER(s.catalogue_slug) = $2
          AND s.is_published IS TRUE`,
      [cat.owner_id, productSlug, !!cat.show_prices]);
    if (!p) return res.status(404).json({ error: 'Not found' });

    const { rows: photos } = await db.query(
      `SELECT id, alt_text FROM catalogue_photos
        WHERE sku_id = $1 ORDER BY sort_order, id`, [p.id]);

    res.json({ ...p, photos });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* GET /public/catalogue/photo/:id — the image bytes.
 *
   /attachments/:id/download requires a token, and a stranger's browser has
   none. This is the one route that serves a file without authentication,
   so it is joined all the way back to a PUBLISHED product of a PUBLISHED
   catalogue. An attachment id that is not a catalogue photo of something
   currently published returns 404, which means unpublishing a product
   takes its photographs down with it. */
exports.publicPhoto = async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      `SELECT a.filename, a.mime, a.data
         FROM catalogue_photos cp
         JOIN attachments a ON a.id = cp.attachment_id
         JOIN skus s ON s.id = cp.sku_id
         JOIN catalogue_settings cs ON cs.owner_id = s.owner_id
        WHERE cp.id = $1
          AND s.is_published IS TRUE
          AND cs.is_published IS TRUE`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    /* A catalogue photo does not change once uploaded, and this is the
       heaviest thing the page fetches. */
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(row.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* POST /public/enquiry — a stranger's basket.
 *
   The only public write in the product, so it is deliberately narrow: it
   accepts a name, a way to reach them, and a list of things. It cannot
   name the organisation — that comes from the slug — and it cannot set a
   status, a customer or a reference. */
exports.publicEnquiry = async (req, res) => {
  const client = await db.getClient();
  try {
    const slug = cleanSlug(req.params.slug);
    const { name, company, phone, email, message, items } = req.body || {};

    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'Please tell us your name so we know who to call back.' });
    }
    if (!String(phone || '').trim() && !String(email || '').trim()) {
      return res.status(400).json({ error: 'Please leave a phone number or an email — otherwise we cannot reply.' });
    }
    const lines = Array.isArray(items) ? items.filter(i => String(i?.description || '').trim()) : [];
    if (!lines.length) {
      return res.status(400).json({ error: 'Add at least one item to your enquiry.' });
    }
    if (lines.length > 50) {
      return res.status(400).json({ error: 'That is more items than we can take in one enquiry.' });
    }

    const { rows: [cat] } = await client.query(
      `SELECT owner_id, enquiry_email FROM catalogue_settings
        WHERE LOWER(slug) = $1 AND is_published IS TRUE`, [slug]);
    if (!cat) return res.status(404).json({ error: 'Catalogue not found' });

    await client.query('BEGIN');
    const { rows: [enq] } = await client.query(
      `INSERT INTO enquiries (owner_id, name, company, phone, email, message, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,'New','catalogue') RETURNING id`,
      [cat.owner_id, String(name).trim().slice(0, 120), (company || '').slice(0, 160),
       (phone || '').slice(0, 40), (email || '').slice(0, 160), (message || '').slice(0, 2000)]);

    const ref = `ENQ-${String(enq.id).padStart(4, '0')}`;
    await client.query('UPDATE enquiries SET ref = $1 WHERE id = $2', [ref, enq.id]);

    let so = 0;
    for (const l of lines) {
      /* The sku is accepted only if it belongs to this catalogue and is
         published — otherwise a crafted request could attach an enquiry
         line to another organisation's product. */
      const { rows: [ok] } = await client.query(
        `SELECT id FROM skus WHERE id = $1 AND owner_id = $2 AND is_published IS TRUE`,
        [l.skuId || 0, cat.owner_id]);
      await client.query(
        `INSERT INTO enquiry_items (enquiry_id, sku_id, description, quantity, unit, note, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [enq.id, ok ? ok.id : null, String(l.description).slice(0, 300),
         Number(l.quantity) || null, (l.unit || '').slice(0, 20), (l.note || '').slice(0, 300), so++]);
    }
    await client.query('COMMIT');

    notify('admins', {
      type: 'ENQUIRY_RECEIVED',
      title: `New enquiry · ${ref}`,
      message: `${name}${company ? ` (${company})` : ''} — ${lines.length} item${lines.length > 1 ? 's' : ''}`,
      entityType: 'enquiry', entityId: enq.id, link: '/enquiries',
    });

    res.json({ ref, message: 'Thank you — we have your enquiry and will be in touch.' });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

/* ══════════════════════════════════════════════════════════════════════
   THE BUSINESS'S SIDE — authenticated, owner-scoped
   ══════════════════════════════════════════════════════════════════════ */

exports.getSettings = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const { rows: [row] } = await db.query(
      'SELECT * FROM catalogue_settings WHERE owner_id = $1', [owner]);
    /* No row yet is not an error — it is a business that has not opened
       this screen before. Suggest a slug from their name so the field is
       not staring at them empty. */
    if (!row) {
      const company = await profileFor(db, owner, 'name').catch(() => null);
      return res.json({
        exists: false, slug: cleanSlug(company?.name || ''),
        is_published: false, show_prices: false,
      });
    }
    res.json({ exists: true, ...row });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.saveSettings = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const b = req.body || {};
    const slug = cleanSlug(b.slug);
    if (!slug) return res.status(400).json({ error: 'The catalogue needs a web address — a short name with no spaces.' });

    /* Taken by somebody else. Checked here rather than left to the unique
       index so the message names the problem. */
    const { rows: clash } = await db.query(
      'SELECT owner_id FROM catalogue_settings WHERE LOWER(slug) = $1 AND owner_id <> $2', [slug, owner]);
    if (clash.length) return res.status(409).json({ error: `"${slug}" is already taken. Try another.` });

    const { rows: [row] } = await db.query(
      `INSERT INTO catalogue_settings
         (owner_id, slug, headline, subhead, is_published, show_prices, enquiry_email, whatsapp_number, theme_accent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (owner_id) DO UPDATE SET
         slug = EXCLUDED.slug, headline = EXCLUDED.headline, subhead = EXCLUDED.subhead,
         is_published = EXCLUDED.is_published, show_prices = EXCLUDED.show_prices,
         enquiry_email = EXCLUDED.enquiry_email, whatsapp_number = EXCLUDED.whatsapp_number,
         theme_accent = EXCLUDED.theme_accent, updated_at = NOW()
       RETURNING *`,
      [owner, slug, b.headline || null, b.subhead || null, !!b.is_published, !!b.show_prices,
       b.enquiry_email || null, b.whatsapp_number || null, b.theme_accent || null]);
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* The products screen: everything they sell, with what is published. */
exports.listProducts = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const admin = isCrossTenant(req.user?.role);
    const params = [];
    let scope = '';
    if (!admin) { params.push(owner); scope = ` WHERE owner_id = $${params.length}`; }
    const { rows } = await db.query(
      `SELECT id, sku_code, name, unit, price, headline, use_case, moq,
              lead_time_note, catalogue_slug, is_published, sort_order,
              (SELECT COUNT(*)::int FROM catalogue_photos cp WHERE cp.sku_id = skus.id) AS photo_count
         FROM skus${scope}
        ORDER BY is_published DESC, sort_order, name`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.updateProduct = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const b = req.body || {};
    const { rows: [own] } = await db.query(
      'SELECT id, name FROM skus WHERE id = $1 AND owner_id = $2', [req.params.id, owner]);
    if (!own) return res.status(404).json({ error: 'Product not found' });

    /* Publishing without a web address would put a product on the page
       with no link to it, so give it one from its name. */
    let slug = b.catalogue_slug != null ? cleanSlug(b.catalogue_slug) : undefined;
    if (b.is_published && !slug) {
      const { rows: [cur] } = await db.query('SELECT catalogue_slug FROM skus WHERE id = $1', [own.id]);
      slug = cleanSlug(cur?.catalogue_slug || own.name);
    }

    const sets = [], vals = [];
    const put = (col, v) => { if (v !== undefined) { vals.push(v); sets.push(`${col} = $${vals.length}`); } };
    put('headline', b.headline);
    put('use_case', b.use_case);
    put('moq', b.moq === '' ? null : b.moq);
    put('lead_time_note', b.lead_time_note);
    put('sort_order', b.sort_order);
    put('catalogue_slug', slug);
    if (b.is_published !== undefined) put('is_published', !!b.is_published);
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });

    vals.push(own.id);
    try {
      const { rows: [row] } = await db.query(
        `UPDATE skus SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
      res.json(row);
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: `Another of your products already uses the address "${slug}".` });
      }
      throw e;
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── enquiries inbox ────────────────────────────────────────────────── */

exports.listEnquiries = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const admin = isCrossTenant(req.user?.role);
    const params = [];
    const where = [];
    if (!admin) { params.push(owner); where.push(`e.owner_id = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); where.push(`e.status = $${params.length}`); }
    const { rows } = await db.query(
      `SELECT e.*,
              (SELECT COUNT(*)::int FROM enquiry_items i WHERE i.enquiry_id = e.id) AS item_count
         FROM enquiries e
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY CASE e.status WHEN 'New' THEN 0 WHEN 'Read' THEN 1 ELSE 2 END, e.created_at DESC
        LIMIT 200`, params);
    const { rows: [s] } = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'New')::int AS new,
              COUNT(*) FILTER (WHERE status = 'Quoted')::int AS quoted,
              COUNT(*) FILTER (WHERE status = 'Won')::int AS won
         FROM enquiries${where.length ? ' WHERE ' + where.join(' AND ').replace(/e\./g, '') : ''}`, params);
    res.json({ items: rows, summary: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getEnquiry = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const admin = isCrossTenant(req.user?.role);
    const { rows: [e] } = await db.query(
      `SELECT * FROM enquiries WHERE id = $1${admin ? '' : ' AND owner_id = $2'}`,
      admin ? [req.params.id] : [req.params.id, owner]);
    if (!e) return res.status(404).json({ error: 'Enquiry not found' });
    const { rows: items } = await db.query(
      'SELECT * FROM enquiry_items WHERE enquiry_id = $1 ORDER BY sort_order, id', [e.id]);
    res.json({ ...e, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const ENQUIRY_STATUSES = ['New', 'Read', 'Quoted', 'Won', 'Ignored'];
exports.setEnquiryStatus = async (req, res) => {
  try {
    const owner = ownerOf(req);
    const { status } = req.body || {};
    if (!ENQUIRY_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of ${ENQUIRY_STATUSES.join(', ')}` });
    }
    const { rowCount } = await db.query(
      'UPDATE enquiries SET status = $1, updated_at = NOW() WHERE id = $2 AND owner_id = $3',
      [status, req.params.id, owner]);
    if (!rowCount) return res.status(404).json({ error: 'Enquiry not found' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* POST /enquiries/:id/convert — the moment a stranger becomes a customer.
 *
   This is where the customers row is finally created, and not one moment
   earlier. Everything downstream — quotation, order, invoice — is the
   chain that already exists; this only joins the enquiry to the front of
   it. */
exports.convertEnquiry = async (req, res) => {
  const client = await db.getClient();
  try {
    const owner = ownerOf(req);
    const { rows: [e] } = await client.query(
      'SELECT * FROM enquiries WHERE id = $1 AND owner_id = $2', [req.params.id, owner]);
    if (!e) return res.status(404).json({ error: 'Enquiry not found' });
    if (e.customer_id) {
      return res.status(409).json({
        error: 'This enquiry has already been converted.',
        customerId: e.customer_id, quotationId: e.quotation_id,
      });
    }

    await client.query('BEGIN');
    /* Their company name if they gave one, otherwise their own — an
       enquiry from a person buying for themselves is still a customer. */
    const custName = String(e.company || e.name).trim();
    const { rows: [cust] } = await client.query(
      `INSERT INTO customers (name, phone, email, owner_id)
       VALUES ($1,$2,$3,$4) RETURNING id, name`,
      [custName, e.phone || null, e.email || null, owner]);

    await client.query(
      `UPDATE enquiries SET customer_id = $1, status = 'Quoted', updated_at = NOW() WHERE id = $2`,
      [cust.id, e.id]);
    await client.query('COMMIT');

    const { rows: items } = await db.query(
      'SELECT * FROM enquiry_items WHERE enquiry_id = $1 ORDER BY sort_order, id', [e.id]);

    /* The quotation is not created here. It is prefilled in the builder so
       a person can price it before anything is committed — the enquiry
       says what they asked for, not what you are willing to sell it for. */
    res.json({
      customerId: cust.id,
      customerName: cust.name,
      prefill: {
        customerId: cust.id,
        items: items.map(i => ({
          description: i.description,
          quantity: i.quantity || 1,
          uom: i.unit || 'nos',
          rate: '',
        })),
      },
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};
