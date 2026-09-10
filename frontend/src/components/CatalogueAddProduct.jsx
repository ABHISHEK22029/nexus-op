/* ══════════════════════════════════════════════════════════
   Adding a product from the catalogue screen.

   The screen could publish, hide and edit products — but not create one.
   The empty state said "add them under Stock → Products, then publish
   them here", which is a fair description of a gap, not a workflow.
   Somebody setting up a catalogue is thinking about what they sell, not
   about which screen owns the SKU table.

   Four fields, because that is all a product needs to exist: a name, and
   optionally a code, a unit and a price. Everything a visitor reads —
   the headline, the photograph, the category, the lead time — belongs to
   the editor, which opens straight after this so the two feel like one
   action rather than two screens.

   Module scope, not nested inside the parent: a component declared in
   another component's body remounts on every render and the caret jumps
   out of whatever is being typed.
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

export default function CatalogueAddProduct({ open, api, toast, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', sku_code: '', unit: 'Nos', price: '' });
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('A product needs a name.'); return; }
    setSaving(true);
    try {
      const made = await api('/skus', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          /* A code is genuinely optional — plenty of small fabricators do
             not run one — but leaving it null makes the product hard to
             find later, so derive something legible from the name. */
          sku_code: form.sku_code.trim() || form.name.trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24),
          unit: form.unit.trim() || 'Nos',
          price: form.price === '' ? null : Number(form.price),
        }),
      });
      const id = made.id ?? made.sku?.id;
      toast.success(`${form.name.trim()} added`);
      setForm({ name: '', sku_code: '', unit: 'Nos', price: '' });
      /* Hand the new row back so the parent can open its editor — the
         next thing anybody wants is a photograph and a headline. */
      onCreated({
        id, name: form.name.trim(),
        sku_code: form.sku_code.trim() || null,
        unit: form.unit.trim() || 'Nos',
        price: form.price === '' ? null : Number(form.price),
        is_published: false, photo_count: 0,
      });
      onClose();
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  const input = {
    width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)', borderRadius: 9,
    color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none',
  };
  const lbl = {
    display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)',
    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <div role="dialog" aria-label="Add a product" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 85,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={create} style={{
        width: 'min(430px, 100%)', background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 22,
        display: 'grid', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Add a product
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>
              Just enough to create it. Photographs and the words a customer reads come next.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div>
          <label style={lbl}>Name *</label>
          <input style={input} value={form.name} autoFocus
            placeholder="11 KV V cross arm 75 × 40 × 6"
            onChange={e => set('name', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>Code</label>
            <input style={input} value={form.sku_code} placeholder="VC-01"
              onChange={e => set('sku_code', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Unit</label>
            <input style={input} value={form.unit} placeholder="Nos"
              onChange={e => set('unit', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Rate ₹</label>
            <input style={input} type="number" value={form.price} placeholder="833"
              onChange={e => set('price', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button type="submit" disabled={saving} className="btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> {saving ? 'Adding…' : 'Add and continue'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        </div>
      </form>
    </div>
  );
}
