/* ══════════════════════════════════════════════════════════
   "Save as product" on a line that was typed in.

   A typed line works on its own document, but nothing after it knows what
   it is: no bill of materials, so readiness "cannot be computed"; Make
   opens a job with no material plan; dispatch can't find its stock by
   product. The only way to fix that was to leave the form for the Products
   page. This saves the line as a product — its name, unit, price and HSN —
   and links the line to it, without leaving.
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { PackagePlus } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function SaveAsProduct({ description, unit, price, hsn, onSaved }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const name = String(description || '').trim();
  if (!name) return null;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body = { name, unit: unit || 'nos', price: Number(price) > 0 ? Number(price) : null, hsn: hsn || null };
      const r = await fetch(`${API}/skus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error(d.error || 'Could not save the product');
      toast.success(`“${name}” saved as a product. Add its bill of materials on Products when you're ready.`);
      onSaved({ id: d.id, name, unit: body.unit, price: body.price, hsn: body.hsn });
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <button type="button" onClick={save} disabled={saving} data-save-as-product
      title="Save this line as a product, so the bill of materials, production and stock can follow it"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: 0, background: 'none', border: 'none',
        cursor: 'pointer', color: 'var(--brand-amber)', fontWeight: 600, fontSize: '0.74rem' }}>
      <PackagePlus size={12} /> {saving ? 'Saving…' : 'Save as product'}
    </button>
  );
}
