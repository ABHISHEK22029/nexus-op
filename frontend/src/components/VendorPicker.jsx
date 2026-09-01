/* ══════════════════════════════════════════════════════════
   VendorPicker — choose a vendor, optionally narrowed to the ones who
   actually supply what you're buying.

   The PO screen offered a flat alphabetical list of every vendor, which
   tells a buyer nothing: it does not say who stocks the item, what their
   minimum order is, how long they take, or what they charged last time.
   Those four facts ARE the procurement decision, and they were already in
   vendor_items — just never surfaced where the decision is made.

   The material selector is deliberately OPTIONAL. PO line items here are
   free text with no material link, so nothing can be inferred; forcing a
   material would block anyone buying something not yet in the catalogue.
   Leave it blank and you get the old flat list, which is the right
   behaviour rather than a fallback.

   When a material IS chosen and nothing is linked to it, the component says
   so and still offers every vendor. An empty dropdown would read as "no
   vendors exist" when it means "nobody has told us who sells this".
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Star, Clock, Package, Info } from 'lucide-react';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rup = (n) => (n == null || n === '' ? null : `₹${Number(n).toLocaleString('en-IN')}`);

export default function VendorPicker({
  vendors = [],
  value,
  onChange,
  className = '',
  selectClassName = '',
  labelClassName = '',
}) {
  const [materials, setMaterials] = useState([]);
  const [materialId, setMaterialId] = useState('');
  const [supplying, setSupplying] = useState(null);   // null = not narrowed
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const token = getToken();
    fetch(`${API}/raw-materials?limit=200`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setMaterials(Array.isArray(d) ? d : (d?.items || [])))
      .catch(() => setMaterials([]));
  }, []);

  useEffect(() => {
    if (!materialId) { setSupplying(null); setNote(''); return; }
    setLoading(true);
    const token = getToken();
    fetch(`${API}/raw-materials/${materialId}/vendors`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(d => {
        setSupplying(d.hasLinks ? d.items : null);
        setNote(d.hasLinks ? '' : (d.message || 'No vendors are linked to this material yet — showing all vendors.'));
      })
      .catch(() => { setSupplying(null); setNote('Could not load linked vendors — showing all vendors.'); })
      .finally(() => setLoading(false));
  }, [materialId]);

  const narrowed = Array.isArray(supplying) && supplying.length > 0;
  const chosen = narrowed ? supplying.find(s => String(s.vendor_id) === String(value)) : null;

  return (
    <div className={className}>
      <label className={labelClassName || 'block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2'}>
        Buying which material? <span className="normal-case tracking-normal text-gray-500">(optional — narrows the vendor list)</span>
      </label>
      <select
        value={materialId}
        onChange={e => setMaterialId(e.target.value)}
        className={selectClassName || 'w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500 mb-3'}
      >
        <option value="">All vendors</option>
        {materials.map(m => (
          <option key={m.id} value={m.id}>{m.name || m.description || `Material ${m.id}`}</option>
        ))}
      </select>

      <label className={labelClassName || 'block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2'}>
        Vendor <span className="text-red-400">*</span>
        {narrowed && (
          <span className="normal-case tracking-normal text-amber-500/80">
            {' '}— {supplying.length} supply this
          </span>
        )}
      </label>

      <select
        required
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className={selectClassName || 'w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500'}
      >
        <option value="" disabled>{loading ? 'Loading…' : 'Select Vendor...'}</option>
        {narrowed
          ? supplying.map(s => (
              <option key={s.vendor_id} value={s.vendor_id}>
                {s.is_preferred ? '★ ' : ''}{s.name}
                {s.price != null ? ` — ${rup(s.price)}${s.price_uom ? '/' + s.price_uom : ''}` : ''}
                {s.lead_time_days != null ? ` · ${s.lead_time_days}d` : ''}
                {s.moq != null ? ` · MOQ ${s.moq}` : ''}
              </option>
            ))
          : vendors.map(v => (
              <option key={v.id} value={v.id}>
                {v.name} {v.gstin ? `(GST: ${v.gstin})` : '(No GST)'}
              </option>
            ))}
      </select>

      {note && (
        <div className="mt-1 text-xs text-gray-400 flex items-start gap-1">
          <Info size={12} className="mt-0.5 shrink-0" /> <span>{note}</span>
        </div>
      )}

      {/* The terms behind the choice, once one is made. Seeing "MOQ 500"
          before raising the PO is the difference between ordering 200 and
          finding out at the vendor's end. */}
      {chosen && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-300">
          {chosen.is_preferred && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <Star size={11} fill="currentColor" /> preferred
            </span>
          )}
          {chosen.price != null && (
            <span>Last agreed {rup(chosen.price)}{chosen.price_uom ? `/${chosen.price_uom}` : ''}</span>
          )}
          {chosen.moq != null && (
            <span className="inline-flex items-center gap-1">
              <Package size={11} /> MOQ {chosen.moq}
            </span>
          )}
          {chosen.lead_time_days != null && (
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> {chosen.lead_time_days} day lead time
            </span>
          )}
          {chosen.vendor_item_code && <span>their code: {chosen.vendor_item_code}</span>}
        </div>
      )}
    </div>
  );
}
