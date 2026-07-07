import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check, Layers } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* Recipe / Bill of Materials editor for one SKU.
   Lines: { rawMaterialId?, componentName, qtyPerUnit, uom }
   When you later hit "Make (Production)" on a customer-order line, these
   quantities are multiplied by the ordered qty to pre-fill what to consume. */
export default function BomModal({ sku, onClose }) {
  const toast = useToast();
  const [lines, setLines] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [b, m] = await Promise.all([
          fetch(`${API}/skus/${sku.id}/bom`).then(r => (r.ok ? r.json() : [])),
          fetch(`${API}/raw-materials`).then(r => (r.ok ? r.json() : [])),
        ]);
        setMaterials(m);
        setLines(
          (b || []).map(x => ({
            rawMaterialId: x.raw_material_id ?? '',
            componentName: x.component_name ?? '',
            qtyPerUnit: x.qty_per_unit ?? '',
            uom: x.uom ?? 'kg',
          }))
        );
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [sku.id]);

  const addLine = () => setLines([...lines, { rawMaterialId: '', componentName: '', qtyPerUnit: '', uom: 'kg' }]);
  const removeLine = (i) => setLines(lines.filter((_, idx) => idx !== i));
  const setLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // Picking a raw material auto-fills the component name + its unit.
  const pickMaterial = (i, val) => {
    const mat = materials.find(m => String(m.id) === String(val));
    setLine(i, {
      rawMaterialId: val || '',
      componentName: mat ? mat.name : lines[i].componentName,
      uom: mat && (mat.unit || mat.uom) ? (mat.unit || mat.uom) : lines[i].uom,
    });
  };

  const save = async () => {
    const clean = lines.filter(l => (l.componentName || '').trim());
    for (const l of clean) {
      if (!(Number(l.qtyPerUnit) > 0)) { toast.error(`Enter a qty for "${l.componentName}"`); return; }
    }
    try {
      const res = await fetch(`${API}/skus/${sku.id}/bom`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: clean.map(l => ({
            rawMaterialId: l.rawMaterialId ? Number(l.rawMaterialId) : null,
            componentName: l.componentName.trim(),
            qtyPerUnit: Number(l.qtyPerUnit),
            uom: l.uom || 'kg',
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save recipe');
      toast.success('Recipe (BOM) saved');
      onClose(true);
    } catch (err) { toast.error(err.message); }
  };

  const input = { width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' };

  return (
    <div onClick={() => onClose(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, boxShadow: 'var(--shadow-md)', padding: 22, maxHeight: '86vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={20} style={{ color: 'var(--brand-amber)' }} />
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Recipe / Bill of Materials</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{sku.name}{sku.sku_code ? ` · ${sku.sku_code}` : ''}</div>
            </div>
          </div>
          <button onClick={() => onClose(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '10px 0 16px', lineHeight: 1.5 }}>
          What raw materials go into <b>one unit</b> of this product. When you click <b>Make</b> on a customer order,
          Nexus multiplies these by the ordered quantity so the production order already knows what to consume.
        </p>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading recipe…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 0.8fr 32px', gap: 8, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 6, padding: '0 2px' }}>
              <div>Raw Material</div><div>Component Name</div><div>Qty / unit</div><div>UoM</div><div></div>
            </div>
            {lines.length === 0 && (
              <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No components yet — add the first one below.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 0.8fr 32px', gap: 8, alignItems: 'center' }}>
                  <select style={input} value={l.rawMaterialId} onChange={e => pickMaterial(i, e.target.value)}>
                    <option value="">— free text —</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input style={input} placeholder="e.g. MS Angle" value={l.componentName} onChange={e => setLine(i, { componentName: e.target.value })} />
                  <input style={input} type="number" step="any" placeholder="4" value={l.qtyPerUnit} onChange={e => setLine(i, { qtyPerUnit: e.target.value })} />
                  <input style={input} placeholder="kg" value={l.uom} onChange={e => setLine(i, { uom: e.target.value })} />
                  <button onClick={() => removeLine(i)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', justifyContent: 'center' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>

            <button onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'var(--bg-elevated)', border: '1px dashed var(--border-default)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>
              <Plus size={15} /> Add component
            </button>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={save} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={15} /> Save recipe</button>
              <button onClick={() => onClose(false)} className="btn-secondary">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
