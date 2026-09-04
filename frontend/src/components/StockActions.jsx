/* ══════════════════════════════════════════════════════════
   Adding stock, and correcting it.

   Stock on hand was read-only apart from the reorder level. The only ways
   a quantity could change were a goods receipt against a purchase order,
   production booking output, and a delivery challan shipping some out.

   That is fine once you are running, and impossible on day one. A business
   moving onto this product already holds stock, and none of it arrived
   through a purchase order recorded here. Without an opening balance the
   first month of reports is wrong, and there is no way to correct a count
   after a physical stock take, or to write off damage.

   The API for both has been there all along — POST /inventory takes an
   opening quantity, POST /inventory/:id/adjust takes a counted quantity
   and a reason — and nothing in the UI ever called either.

   Adjust is deliberately a STOCK TAKE, not "type a new number". You enter
   what you counted; the difference is computed and written to the ledger as
   an `adjustment` movement with your reason attached. An unexplained
   correction to a stock figure is how inventory records stop being
   trusted, so the reason is not optional.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Save, Scale, History, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const authHeaders = () => {
  const t = getToken();
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

/* ── shared chrome ─────────────────────────────────────────── */
function Shell({ title, subtitle, icon, onClose, children, footer, width = 520 }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div style={{
        width: '100%', maxWidth: width, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: 14, boxShadow: 'var(--shadow-lg, 0 20px 50px rgba(0,0,0,.3))',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 18px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{
              display: 'flex', alignItems: 'center', gap: 8, margin: 0,
              fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)',
            }}>{icon}{title}</h2>
            {subtitle && (
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{subtitle}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>{children}</div>

        {footer && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            padding: '13px 18px', borderTop: '1px solid var(--border-subtle)',
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

const label = { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8,
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none',
};
const field = { marginBottom: 13 };

/* ── Add a stock item (opening balance) ────────────────────── */
export function AddStockModal({ onClose, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [catalogue, setCatalogue] = useState({ materials: [], products: [] });
  const [f, setF] = useState({
    link: '', itemName: '', quantity: '', uom: 'nos',
    unitCost: '', minStockLevel: '', location: '', note: 'Opening stock',
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  /* Offer the items already defined, so stock attaches to the material or
     product it belongs to instead of creating a second name for the same
     thing — which is how this database ended up with six rows called
     "Cam Lock Fitting 15mm". */
  useEffect(() => {
    (async () => {
      const get = (u) => fetch(`${API}${u}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : [])).then(d => (Array.isArray(d) ? d : d.items || [])).catch(() => []);
      const [materials, products] = await Promise.all([get('/raw-materials?limit=500'), get('/skus?limit=500')]);
      setCatalogue({ materials, products });
    })();
  }, []);

  const pick = (val) => {
    if (!val) return setF(p => ({ ...p, link: '' }));
    const [kind, id] = val.split(':');
    const src = kind === 'm' ? catalogue.materials : catalogue.products;
    const hit = src.find(x => String(x.id) === id);
    setF(p => ({
      ...p, link: val,
      itemName: hit?.name || p.itemName,
      uom: hit?.base_uom || hit?.unit || p.uom,
    }));
  };

  const submit = async () => {
    const qty = Number(f.quantity);
    if (!f.itemName.trim() && !f.link) return toast.error('Choose an item, or type a name for it');
    if (!f.quantity || Number.isNaN(qty)) return toast.error('Enter the quantity you are holding');
    if (qty < 0) return toast.error('Opening stock cannot be negative');

    const [kind, id] = f.link ? f.link.split(':') : [];
    setSaving(true);
    try {
      const res = await fetch(`${API}/inventory`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          itemName: f.itemName.trim() || undefined,
          rawMaterialId: kind === 'm' ? Number(id) : undefined,
          skuId: kind === 'p' ? Number(id) : undefined,
          quantity: qty,
          uom: f.uom || undefined,
          unitCost: f.unitCost === '' ? undefined : Number(f.unitCost),
          minStockLevel: f.minStockLevel === '' ? undefined : Number(f.minStockLevel),
          location: f.location.trim() || undefined,
          note: f.note.trim() || 'Opening stock',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not add the stock item');
      toast.success(`${f.itemName || 'Stock'} added`);
      onSaved?.();
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Shell
      title="Add stock"
      subtitle="Record what you already hold. This writes an opening-balance entry to the ledger."
      icon={<Plus size={17} style={{ color: 'var(--brand-amber)' }} />}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={submit} disabled={saving} className="btn-primary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Save size={14} />{saving ? 'Adding…' : 'Add stock'}
        </button>
      </>}
    >
      <div style={field}>
        <label style={label}>Item</label>
        <select value={f.link} onChange={e => pick(e.target.value)} style={input}>
          <option value="">— not in the item list, type a name below —</option>
          {catalogue.materials.length > 0 && (
            <optgroup label="Raw materials">
              {catalogue.materials.map(m => <option key={`m${m.id}`} value={`m:${m.id}`}>{m.name}</option>)}
            </optgroup>
          )}
          {catalogue.products.length > 0 && (
            <optgroup label="Products">
              {catalogue.products.map(p => <option key={`p${p.id}`} value={`p:${p.id}`}>{p.name}</option>)}
            </optgroup>
          )}
        </select>
        <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>
          Linking to an existing item keeps one balance per item instead of a second row with the same name.
        </p>
      </div>

      <div style={field}>
        <label style={label}>Item name</label>
        <input value={f.itemName} onChange={e => set('itemName', e.target.value)}
          placeholder="e.g. MDF 16mm 8x4" style={input} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={field}>
          <label style={label}>Quantity held</label>
          <input type="number" min="0" step="any" value={f.quantity}
            onChange={e => set('quantity', e.target.value)} placeholder="0" style={input} />
        </div>
        <div style={field}>
          <label style={label}>Unit</label>
          <input value={f.uom} onChange={e => set('uom', e.target.value)}
            placeholder="nos, kg, sqm…" style={input} />
        </div>
        <div style={field}>
          <label style={label}>Cost per unit <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>optional</span></label>
          <input type="number" min="0" step="any" value={f.unitCost}
            onChange={e => set('unitCost', e.target.value)} placeholder="₹" style={input} />
        </div>
        <div style={field}>
          <label style={label}>Reorder level <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>optional</span></label>
          <input type="number" min="0" step="any" value={f.minStockLevel}
            onChange={e => set('minStockLevel', e.target.value)} placeholder="warn below this" style={input} />
        </div>
      </div>

      <div style={field}>
        <label style={label}>Where it is <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>optional</span></label>
        <input value={f.location} onChange={e => set('location', e.target.value)}
          placeholder="e.g. Yard 2, Rack B" style={input} />
      </div>
    </Shell>
  );
}

/* ── One item: correct the count, and read its history ─────── */
export function ItemStockPanel({ item, onClose, onSaved }) {
  const toast = useToast();
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [moves, setMoves] = useState(null);
  const [drift, setDrift] = useState(0);

  const current = Number(item.quantity) || 0;

  /* The endpoint answers with { item, ledger, ledgerBalance, storedBalance,
     drift } — not a bare array and not { items }. Reading `items` here
     returned undefined, so the panel said "nothing recorded yet" over an
     item with two ledger entries. */
  useEffect(() => {
    fetch(`${API}/inventory/${item.id}/movements`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : {}))
      .then(d => {
        setMoves(Array.isArray(d) ? d : (d.ledger || []));
        setDrift(Number(d?.drift) || 0);
      })
      .catch(() => setMoves([]));
  }, [item.id]);

  const delta = useMemo(() => {
    if (counted === '' || Number.isNaN(Number(counted))) return null;
    return Number(counted) - current;
  }, [counted, current]);

  const submit = async () => {
    if (counted === '' || Number.isNaN(Number(counted))) return toast.error('Enter the quantity you counted');
    if (Number(counted) < 0) return toast.error('A counted quantity cannot be negative');
    if (delta === 0) return toast.error('That matches the current figure — nothing to correct');
    /* Required on purpose: a stock figure that moves for no recorded
       reason is the point at which people stop believing the numbers. */
    if (!reason.trim()) return toast.error('Say why it changed — this goes on the ledger entry');

    setSaving(true);
    try {
      const res = await fetch(`${API}/inventory/${item.id}/adjust`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ countedQuantity: Number(counted), reason: reason.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not record the count');
      toast.success(`${item.itemName}: ${current} → ${Number(counted)}`);
      onSaved?.();
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deltaTone = delta === null || delta === 0 ? 'var(--text-muted)'
    : delta > 0 ? '#059669' : '#dc2626';

  return (
    <Shell
      title={item.itemName}
      subtitle={`Holding ${current.toLocaleString('en-IN')} ${item.uom || item.base_uom || 'units'}`}
      icon={<Scale size={17} style={{ color: 'var(--brand-amber)' }} />}
      onClose={onClose}
      width={600}
      footer={<>
        <button onClick={onClose} className="btn-secondary btn-sm">Close</button>
        <button onClick={submit} disabled={saving} className="btn-primary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Save size={14} />{saving ? 'Recording…' : 'Record count'}
        </button>
      </>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={field}>
          <label style={label}>System says</label>
          <div style={{ ...input, background: 'transparent', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            {current.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={field}>
          <label style={label}>You counted</label>
          <input autoFocus type="number" min="0" step="any" value={counted}
            onChange={e => setCounted(e.target.value)} placeholder="physical count" style={input} />
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        padding: '9px 12px', borderRadius: 8, background: 'var(--bg-elevated)',
        fontSize: '0.83rem', color: deltaTone, fontWeight: 700,
      }}>
        {delta === null ? <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
          The difference will be written to the ledger, not the balance overwritten.
        </span> : delta === 0 ? 'No difference' : (
          <>{delta > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {delta > 0 ? '+' : ''}{delta.toLocaleString('en-IN')} {item.uom || 'units'}
            <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
              {delta > 0 ? 'found' : 'short'}
            </span>
          </>
        )}
      </div>

      <div style={field}>
        <label style={label}>Why</label>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Annual stock take, 2 sheets damaged in handling" style={input} />
      </div>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        <h3 style={{
          display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 10px',
          fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '.04em',
        }}><History size={13} /> Movements</h3>

        {/* The balance and the sum of the ledger should be the same number.
            When they are not, something wrote to inventory without going
            through shared/stock, and the figure on the card is not
            explained by its own history — worth saying out loud rather
            than leaving someone to add the column up by hand. */}
        {drift !== 0 && (
          <div style={{
            display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 10,
            padding: '8px 11px', borderRadius: 8,
            background: 'rgba(245,158,11,0.12)', color: '#b45309', fontSize: '0.78rem',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              The balance is {drift > 0 ? 'higher' : 'lower'} than its movements explain
              by <strong>{Math.abs(drift).toLocaleString('en-IN')}</strong>. Something changed
              this figure without writing a ledger entry.
            </span>
          </div>
        )}

        {moves === null ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading…</p>
        ) : moves.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Nothing recorded against this item yet.
          </p>
        ) : (
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {moves.map(m => {
              const q = Number(m.quantity) || 0;
              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0',
                  borderBottom: '1px solid var(--border-subtle)', fontSize: '0.81rem',
                }}>
                  <span style={{
                    minWidth: 74, textAlign: 'right', fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: q >= 0 ? '#059669' : '#dc2626',
                  }}>{q > 0 ? '+' : ''}{q.toLocaleString('en-IN')}</span>
                  <span style={{ flex: 1, color: 'var(--text-primary)' }}>
                    {m.movement_type}
                    {m.ref_number && <span style={{ color: 'var(--text-muted)' }}> · {m.ref_number}</span>}
                    {m.note && <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.note}</span>}
                  </span>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {m.created_at ? new Date(m.created_at).toLocaleDateString('en-IN') : ''}
                    {/* What the stock stood at after this line — the figure
                        someone reconciling is actually looking for. */}
                    {m.balance_after != null && (
                      <span style={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                        → {Number(m.balance_after).toLocaleString('en-IN')}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
