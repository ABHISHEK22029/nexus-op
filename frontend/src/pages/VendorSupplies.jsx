/* ══════════════════════════════════════════════════════════
   Vendor Supplies — who sells what, at what price, with what minimum.

   This is the data that turns a shortfall into a purchase order. Without
   it, raising a PO means scrolling every vendor in the account and
   remembering which one sells steel.

   Manageable from either direction: pick a material and see its vendors,
   or pick a vendor and see everything they supply.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';
import { Link2, Plus, Trash2, Star, Search, Package, Info } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }));

export default function VendorSupplies({ embedded = false }) {
  const toast = useToast();
  const [mode, setMode] = useState('material');   // 'material' | 'vendor'
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selected, setSelected] = useState('');
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);

  useEffect(() => {
    fetch(`${API}/raw-materials?limit=200`).then(r => r.ok ? r.json() : { items: [] })
      .then(d => setMaterials(d.items || d || [])).catch(() => {});
    fetch(`${API}/vendors?limit=200`).then(r => r.ok ? r.json() : { items: [] })
      .then(d => setVendors(d.items || d || [])).catch(() => {});
  }, []);

  const loadLinks = async () => {
    if (!selected) { setLinks([]); return; }
    setLoading(true);
    try {
      const key = mode === 'material' ? 'materialId' : 'vendorId';
      const r = await fetch(`${API}/vendor-items?${key}=${selected}`);
      const d = await r.json();
      // /vendor-items now follows the shared list contract: a plain array
      // unless ?limit is passed, an { items, total, summary } envelope when
      // it is. Accept either, as the material/vendor loads above already do.
      setLinks(d.items || (Array.isArray(d) ? d : []));
    } catch { toast?.error?.('Could not load supply links'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadLinks(); }, [selected, mode]);

  const save = async () => {
    if (!form?.counterpartId) { toast?.error?.(mode === 'material' ? 'Pick a vendor' : 'Pick a material'); return; }
    const body = mode === 'material'
      ? { raw_material_id: Number(selected), vendor_id: Number(form.counterpartId) }
      : { vendor_id: Number(selected), raw_material_id: Number(form.counterpartId) };
    Object.assign(body, {
      price: form.price === '' ? null : Number(form.price),
      moq: form.moq === '' ? null : Number(form.moq),
      lead_time_days: form.lead === '' ? null : Number(form.lead),
      vendor_item_code: form.code || null,
      is_preferred: !!form.preferred,
    });
    try {
      const r = await fetch(`${API}/vendor-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save');
      toast?.success?.('Supply link saved');
      setForm(null); loadLinks();
    } catch (e) { toast?.error?.(e.message); }
  };

  const setPreferred = async (id) => {
    try {
      await fetch(`${API}/vendor-items/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_preferred: true }) });
      toast?.success?.('Preferred supplier updated'); loadLinks();
    } catch { toast?.error?.('Could not update'); }
  };

  const unlink = async (id) => {
    if (!window.confirm('Remove this supply link?')) return;
    try {
      await fetch(`${API}/vendor-items/${id}`, { method: 'DELETE' });
      toast?.success?.('Link removed'); loadLinks();
    } catch { toast?.error?.('Could not remove'); }
  };

  const list = mode === 'material' ? materials : vendors;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? list.filter(x => String(x.name).toLowerCase().includes(q)) : list;
  }, [list, search]);

  const counterparts = mode === 'material' ? vendors : materials;

  return (
    <div style={{ maxWidth: 1150 }}>
      {/* Hidden when embedded as a tab of Vendors — the tab already says
          where you are, and a second title would just repeat it. */}
      {!embedded && <div style={{ marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
          <Link2 size={22} style={{ color: 'var(--brand-amber)' }} /> Vendor Supplies
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: 4, maxWidth: '72ch' }}>
          Record which vendors supply which materials, with their price, minimum order and lead time.
          Purchase orders then show only the vendors who actually sell the item, and shortfalls round up
          to the right supplier's minimum.
        </p>
      </div>}

      {/* Direction toggle — same data, whichever end you start from */}
      <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 9, padding: 3, marginBottom: 14 }}>
        {[['material', 'By material'], ['vendor', 'By vendor']].map(([v, label]) => (
          <button key={v} onClick={() => { setMode(v); setSelected(''); setLinks([]); setForm(null); }}
            style={{
              padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600,
              background: mode === v ? 'var(--brand-amber)' : 'transparent',
              color: mode === v ? '#fff' : 'var(--text-secondary)',
            }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Picker */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${mode === 'material' ? 'materials' : 'vendors'}…`}
              style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
          </div>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.83rem' }}>Nothing matches</div>
              : filtered.map(x => (
                <button key={x.id} onClick={() => { setSelected(String(x.id)); setForm(null); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle)', fontSize: '0.83rem',
                    background: String(x.id) === selected ? 'var(--bg-elevated)' : 'transparent',
                    color: String(x.id) === selected ? 'var(--brand-amber)' : 'var(--text-primary)',
                    fontWeight: String(x.id) === selected ? 700 : 400,
                  }}>
                  {x.name}
                  {x.category && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{x.category}</span>}
                </button>
              ))}
          </div>
        </div>

        {/* Links */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
          {!selected ? (
            /* Browse everything when nothing is picked. Previously this was a
               dead end — "pick a material on the left" and nothing else —
               which is unusable for the questions you actually arrive with:
               "which links have no agreed price?", "who supplies anything at
               all?". Server-side, so it holds up with a real catalogue. */
            <AllLinks />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700 }}>{links.length} link{links.length === 1 ? '' : 's'}</div>
                <button onClick={() => setForm({ counterpartId: '', price: '', moq: '', lead: '', code: '', preferred: links.length === 0 })}
                  className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> Add {mode === 'material' ? 'vendor' : 'material'}
                </button>
              </div>

              {form && (
                <div style={{ padding: 14, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <Field label={mode === 'material' ? 'Vendor' : 'Material'}>
                      <select value={form.counterpartId} onChange={e => setForm({ ...form, counterpartId: e.target.value })} style={inp}>
                        <option value="">Select…</option>
                        {counterparts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Price"><input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={inp} placeholder="per purchase unit" /></Field>
                    <Field label="Min order (MOQ)"><input type="number" value={form.moq} onChange={e => setForm({ ...form, moq: e.target.value })} style={inp} placeholder="e.g. 100" /></Field>
                    <Field label="Lead time (days)"><input type="number" value={form.lead} onChange={e => setForm({ ...form, lead: e.target.value })} style={inp} /></Field>
                    <Field label="Their part code"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={inp} /></Field>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: '0.83rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.preferred} onChange={e => setForm({ ...form, preferred: e.target.checked })} />
                    Preferred supplier <span style={{ color: 'var(--text-muted)' }}>— used for auto-ordering and MOQ rounding</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={save} className="btn-primary btn-sm">Save link</button>
                    <button onClick={() => setForm(null)} className="btn-secondary">Cancel</button>
                  </div>
                </div>
              )}

              {loading ? <div style={{ padding: 34, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
                : links.length === 0 ? (
                  <div style={{ padding: 34, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Info size={20} style={{ opacity: 0.5, marginBottom: 6 }} />
                    <div style={{ fontSize: '0.85rem' }}>
                      Nothing linked yet — purchase orders for this {mode} will show the full vendor list.
                    </div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)' }}>
                        {[mode === 'material' ? 'Vendor' : 'Material', 'Price', 'MOQ', 'Lead', 'Code', ''].map((h, i) => (
                          <th key={h + i} style={{ padding: '9px 12px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', textAlign: i === 0 || i === 4 || i === 5 ? 'left' : 'right' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {links.map(l => (
                        <tr key={l.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '10px 12px', fontSize: '0.85rem' }}>
                            <span style={{ fontWeight: l.is_preferred ? 700 : 400 }}>
                              {mode === 'material' ? l.vendor_name : l.material_name}
                            </span>
                            {l.is_preferred && (
                              <span style={{ marginLeft: 7, fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: 'rgba(245,158,11,0.15)', color: '#b45309' }}>PREFERRED</span>
                            )}
                          </td>
                          <td style={cellNum}>{l.price != null ? `₹${num(l.price)}` : '—'}</td>
                          <td style={cellNum}>{num(l.moq)}</td>
                          <td style={cellNum}>{l.lead_time_days != null ? `${l.lead_time_days}d` : '—'}</td>
                          <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l.vendor_item_code || '—'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {!l.is_preferred && (
                              <button onClick={() => setPreferred(l.id)} title="Make this the preferred supplier"
                                style={iconBtn}><Star size={15} /></button>
                            )}
                            <button onClick={() => unlink(l.id)} title="Remove link" style={iconBtn}><Trash2 size={15} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '7px 9px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' };
const cellNum = { padding: '10px 12px', fontSize: '0.85rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 4 };
const Field = ({ label, children }) => (
  <label style={{ display: 'block' }}>
    <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</span>
    {children}
  </label>
);

/* ══════════════════════════════════════════════════════════
   Every vendor↔material link, searchable — the view you need before you
   know which material you're asking about.

   `missing_price` is the number worth surfacing: a link with no agreed
   price still shows up in the PO picker, but tells the buyer nothing, so
   it is a link that hasn't finished being created.
   ══════════════════════════════════════════════════════════ */
function AllLinks() {
  const q = useListQuery('vendor-items', { pageSize: 25 });
  const s = q.summary || {};

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, padding: 14, borderBottom: '1px solid var(--border-subtle)' }}>
        <Stat label={q.isFiltered ? 'Links (filtered)' : 'Links'} value={s.count ?? q.total} />
        <Stat label="Vendors" value={s.vendors ?? '—'} />
        <Stat label="Materials" value={s.materials ?? '—'} />
        <Stat label="Preferred" value={s.preferred ?? 0} tone="#b45309" />
        <Stat label="No agreed price" value={s.missing_price ?? 0}
          tone={Number(s.missing_price) > 0 ? '#dc2626' : undefined} />
      </div>

      <div style={{ padding: 14 }}>
        <ListToolbar
          q={q}
          placeholder="Search vendor, material, category or their item code…"
          filters={[{
            key: 'is_preferred',
            label: 'Preferred',
            options: [{ value: 'true', label: 'Preferred only' }],
          }]}
        />
      </div>

      {q.rows.length === 0 ? (
        <EmptyState q={q} icon={Package} noun="supply links"
          hint="Pick a material or vendor on the left to create the first one." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
              {['Vendor', 'Material', 'Price', 'MOQ', 'Lead time', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {q.rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                    {r.is_preferred && <span title="Preferred vendor" style={{ color: '#b45309' }}>★ </span>}
                    {r.vendor_name || '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{r.material_name || '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                    {r.price != null
                      ? `₹${Number(r.price).toLocaleString('en-IN')}${r.price_uom ? '/' + r.price_uom : ''}`
                      : <em style={{ color: '#dc2626', fontFamily: 'inherit', fontSize: '0.78rem' }}>not agreed</em>}
                  </td>
                  <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>{r.moq ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{r.lead_time_days != null ? `${r.lead_time_days} days` : '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.vendor_item_code || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ padding: '0 14px 14px' }}><Pagination q={q} /></div>
    </div>
  );
}

const Stat = ({ label, value, tone }) => (
  <div>
    <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{label}</div>
    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: tone || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);
