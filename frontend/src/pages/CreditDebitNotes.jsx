/* ══════════════════════════════════════════════════════════
   Credit & Debit Notes — searchable, filterable, paginated.

   Totals come from `q.summary`, never from summing the rows on screen —
   after pagination the rows are one page, so a locally summed total would
   quietly mean "total on page 1".

   Two deliberate choices here:

   · Credit and debit are shown as SEPARATE cards and are never added
     together. They move in opposite directions — one reduces what a
     customer owes us, the other increases what we owe a vendor — so a
     single combined figure would be a number with no meaning.

   · `unreferenced` counts notes with no original invoice number or date.
     Section 34 read with Rule 53(1A) requires both, and the date is what
     ties the note to a tax period for the GSTR-1 credit note table. A note
     missing them cannot be filed as it stands.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileMinus, Plus, Trash2, X, Eye } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import { useListQuery, ListToolbar, Pagination, EmptyState } from '../components/ListToolbar';

import { getToken } from '../lib/apiAuth';
import UnitSelect from '../components/UnitSelect';
import { PartySelect } from '../components/QuickAddParty';
import { useConfirm } from '../context/ConfirmContext';
import FitNumber from '../components/FitNumber';
import { fmtCompactINR, fmtINR } from '../lib/format';
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
/* Paise always as two digits (lib/format). */
const rupee = (n) => fmtINR(n);

export default function CreditDebitNotes() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useListQuery('credit-debit-notes', { pageSize: 25 });
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [head, setHead] = useState({ noteType: 'credit', partyType: 'customer', partyId: '', noteDate: '', refNumber: '', refDate: '', gstRate: '18', reason: '' });
  const [lines, setLines] = useState([{ description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]);
  const [saving, setSaving] = useState(false);
  const { confirm } = useConfirm();
  /* The chosen party's own invoices (or bills), offered as the original
     the note adjusts — typed from memory, a wrong number made a note that
     referenced nothing. */
  const [refs, setRefs] = useState([]);
  const [params, setParams] = useSearchParams();

  // Only the pick-lists for the form load here; the list itself is q's job.
  useEffect(() => {
    (async () => {
      const [c, v] = await Promise.all([
        fetch(`${API}/customers`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/vendors`).then(r => r.ok ? r.json() : []),
      ]);
      setCustomers(Array.isArray(c) ? c : []); setVendors(Array.isArray(v) ? v : []);
    })();
  }, []);

  /* ?invoice=ID — "Credit note" pressed on an invoice: the customer, the
     invoice, its date and rate, and its lines are carried over, so only
     the quantities being credited need changing. */
  useEffect(() => {
    const invId = Number(params.get('invoice'));
    if (!invId) return;
    (async () => {
      const r = await fetch(`${API}/sales-invoices/${invId}`);
      if (!r.ok) { toast.error('Could not open that invoice'); return; }
      const inv = await r.json();
      setShowForm(true);
      setHead(h => ({ ...h, noteType: 'credit', partyType: 'customer', partyId: String(inv.customer_id || ''),
        refNumber: inv.invoice_number || '', refId: inv.id, refDate: String(inv.invoice_date || '').slice(0, 10),
        gstRate: String(inv.gst_rate ?? h.gstRate) }));
      if ((inv.items || []).length) {
        /* At the price actually charged. Invoice lines keep the rate before
           the invoice's discount, which sits on the invoice: copied as it was,
           a note for 5 of 10 @ ₹100 less 10% credited ₹590, not ₹531, and
           crediting all 10 was refused as more than the invoice. */
        const sub = Number(inv.sub_total) || 0;
        const off = Number(inv.discount) || 0;
        const factor = sub > 0 && off > 0 ? (sub - off) / sub : 1;
        const charged = (rate) => (rate === '' || rate == null ? '' : String(Math.round(Number(rate) * factor * 100) / 100));
        setLines(inv.items.map(it => ({ description: it.description || '', hsn: it.hsn || '', quantity: it.quantity ?? '', uom: it.uom || 'nos', rate: charged(it.rate) })));
      }
      setParams({}, { replace: true });
    })();
    /* eslint-disable-next-line */
  }, []);

  useEffect(() => {
    if (!head.partyId) { setRefs([]); return; }
    const url = head.partyType === 'customer'
      ? `${API}/sales-invoices?customer_id=${head.partyId}&limit=100`
      : `${API}/grn-bills?limit=200`;
    fetch(url).then(r => (r.ok ? r.json() : [])).then(d => {
      const rows = Array.isArray(d) ? d : (d.items || []);
      setRefs(head.partyType === 'customer'
        /* not a draft (not issued yet) or a cancelled one: the server refuses a note against either */
        ? rows.filter(x => x.status !== 'Cancelled' && x.status !== 'Draft').map(x => ({ number: x.invoice_number, date: String(x.invoice_date || '').slice(0, 10), id: x.id }))
        : rows.filter(x => String(x.vendor_id) === String(head.partyId)).map(x => ({ number: x.bill_number, date: String(x.bill_date || '').slice(0, 10), id: x.id })));
    }).catch(() => setRefs([]));
  }, [head.partyId, head.partyType]);

  // A credit note usually goes to a customer, a debit note to a vendor — default sensibly but stay flexible.
  const onType = (noteType) => setHead(h => ({ ...h, noteType, partyType: noteType === 'credit' ? 'customer' : 'vendor', partyId: '' }));
  const parties = head.partyType === 'vendor' ? vendors : customers;
  const setLine = (i, patch) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  /* Quantity times rate. Number('') is 0, so a half-filled line adds
     nothing instead of spreading NaN across every other total. */
  const lineTotal = (l) => (Number(l.quantity) || 0) * (Number(l.rate) || 0);
  const sub = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const total = sub + sub * (Number(head.gstRate) || 0) / 100;

  const create = async (e) => {
    e.preventDefault();
    if (!head.partyId) { toast.error(`Pick a ${head.partyType}`); return; }
    const items = lines.filter(l => l.description.trim());
    if (!items.length) { toast.error('Add at least one line'); return; }
    if (saving) return;             // a double click made two notes
    setSaving(true);
    const token = getToken();
    const res = await fetch(`${API}/credit-debit-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...head, items }),
    }).finally(() => setSaving(false));
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.detail || d.error || 'Could not create the note');
    toast.success(`${d.noteNumber} created`);
    setShowForm(false); setHead({ noteType: 'credit', partyType: 'customer', partyId: '', noteDate: '', refNumber: '', refDate: '', gstRate: '18', reason: '' });
    setLines([{ description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }]);
    q.reload();
  };

  const del = async (n) => {
    if (!(await confirm({ title: `Delete ${n.note_number}?`, message: "The note is removed for good. This can't be undone.", confirmLabel: 'Delete note', tone: 'danger' }))) return;
    const token = getToken();
    const res = await fetch(`${API}/credit-debit-notes/${n.id}`, {
      method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return toast.error(b.detail || b.error || 'Could not delete');
    }
    toast.success('Deleted');
    q.reload();
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.83rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
  const typeBadge = (t) => ({ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.03em', padding: '3px 9px', borderRadius: 6, color: t === 'credit' ? '#10b981' : '#f59e0b', background: (t === 'credit' ? '#10b981' : '#f59e0b') + '1f' });
  const s = q.summary || {};
  const canDelete = can('credit-debit-notes', 'delete');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            <FileMinus size={24} style={{ color: 'var(--brand-amber)' }} /> Credit &amp; Debit Notes
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Adjustments for returns, short-supply and rate corrections — credit note to a customer, debit note to a vendor.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> New Note</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi card={card} label={q.isFiltered ? 'Notes (filtered)' : 'Notes'} value={s.count ?? q.total} />
        {/* Kept apart on purpose: opposite signs, so a combined total would
            mean nothing. */}
        <Kpi card={card} label="Credit notes" value={fmtCompactINR(s.credit_total)} exact={fmtINR(s.credit_total)} tone="#10b981" note="Issued to customers" />
        <Kpi card={card} label="Debit notes" value={fmtCompactINR(s.debit_total)} exact={fmtINR(s.debit_total)} tone="#f59e0b" note="Issued to vendors" />
        <Kpi card={card} label="Missing invoice ref" value={s.unreferenced ?? 0}
          tone={Number(s.unreferenced) > 0 ? '#ef4444' : '#10b981'}
          note={Number(s.unreferenced) > 0 ? 'No original invoice no. / date — Section 34 requires both' : 'All notes carry their original invoice'} />
      </div>

      {showForm && (
        <form onSubmit={create} style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {[{ v: 'credit', l: 'Credit Note', s: 'to a customer' }, { v: 'debit', l: 'Debit Note', s: 'to a vendor' }].map(t => (
              <button type="button" key={t.v} onClick={() => onType(t.v)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid ' + (head.noteType === t.v ? 'var(--brand-amber)' : 'var(--border-default)'),
                  background: head.noteType === t.v ? 'hsl(28,100%,54%,0.1)' : 'var(--bg-surface)' }}>
                <div style={{ fontWeight: 800, color: head.noteType === t.v ? 'var(--brand-amber)' : 'var(--text-primary)' }}>{t.l}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t.s}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
            <div><label style={lbl}>{head.partyType === 'vendor' ? 'Vendor' : 'Customer'} *</label>
              <PartySelect key={head.partyType} kind={head.partyType} style={input} parties={parties}
                setParties={head.partyType === 'vendor' ? setVendors : setCustomers} value={head.partyId}
                onChange={id => setHead(h => ({ ...h, partyId: id }))} />
            </div>
            <div><label style={lbl}>Against (invoice/bill)</label>
              <input style={input} list="note-refs" value={head.refNumber} data-note-ref
                onChange={e => {
                  const v = e.target.value, hit = refs.find(r => r.number === v);
                  setHead(h => ({ ...h, refNumber: v, refId: hit ? hit.id : undefined, refDate: hit ? hit.date : h.refDate }));
                }}
                placeholder={refs.length ? 'Pick or type the number' : 'INV-0007 / GB-0003'} />
              <datalist id="note-refs">{refs.map(r => <option key={r.id} value={r.number}>{r.date}</option>)}</datalist>
            </div>
            {/* The original's date is required on a note (GST Section 34).
                Left blank, it is taken from your own invoice or bill when the
                number above is one of them. */}
            <div><label style={lbl}>Original's date</label><input style={input} type="date" value={head.refDate} onChange={e => setHead({ ...head, refDate: e.target.value })} aria-label="Date of the original invoice or bill" title="Filled in for you when the number is one of your own invoices or bills" /></div>
            <div><label style={lbl}>Note date</label><input style={input} type="date" value={head.noteDate} onChange={e => setHead({ ...head, noteDate: e.target.value })} /></div>
            <div><label style={lbl}>GST %</label><input style={input} type="number" value={head.gstRate} onChange={e => setHead({ ...head, gstRate: e.target.value })} /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Reason</label><input style={input} value={head.reason} onChange={e => setHead({ ...head, reason: e.target.value })} placeholder="e.g. 1 unit returned — damaged in transit" /></div>

          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Lines</div>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <div style={{ flex: 2.5 }}><label style={lbl}>Description *</label><input style={input} value={l.description} onChange={e => setLine(i, { description: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>HSN</label><input style={input} value={l.hsn} inputMode="numeric" maxLength={8} onChange={e => setLine(i, { hsn: e.target.value.replace(/\D/g, '') })} /></div>
              {/* A credit note has to name the unit. "3 returned" against a
                  line originally billed in kilograms is ambiguous, and under
                  section 34 this document adjusts a tax invoice — it should
                  describe the goods the same way that invoice did. */}
              {/* Picked from the standard list (lib/units). It was a text box
                  whose placeholder "nos" looked like a value. */}
              <div style={{ flex: 0.8 }}><label style={lbl}>Unit</label><UnitSelect style={input} value={l.uom} onChange={v => setLine(i, { uom: v })} ariaLabel={`Line ${i + 1} unit`} /></div>
              <div style={{ flex: 0.7 }}><label style={lbl}>Qty</label><input style={input} type="number" min="0" step="any" inputMode="decimal" autoComplete="off" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}><label style={lbl}>Rate ₹</label><input style={input} type="number" min="0" step="any" inputMode="decimal" autoComplete="off" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} /></div>
              <div style={{ flex: 0.9 }}>
                <label style={lbl}>Total ₹</label>
                <div style={{ ...input, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  background: 'var(--bg-elevated)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {lineTotal(l) ? lineTotal(l).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </div>
              </div>
              <button type="button" onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', paddingBottom: 9 }}><X size={16} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <button type="button" onClick={() => setLines([...lines, { description: '', hsn: '', quantity: '', uom: 'nos', rate: '' }])} className="btn-secondary" style={{ fontSize: '0.78rem' }}><Plus size={14} /> Add line</button>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total (incl. GST): <b style={{ color: 'var(--brand-amber)' }}>{rupee(total)}</b></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Create Note'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Note type, not status: every note is stored 'Issued', so status chips
          would filter nothing. Credit vs debit is the real split. */}
      <ListToolbar
        q={q}
        placeholder="Search note no., party, invoice ref, reason…"
        filters={[{
          key: 'note_type',
          label: 'Type',
          options: [
            { value: 'credit', label: 'Credit' },
            { value: 'debit', label: 'Debit' },
          ],
        }]}
      />

      <div style={{ ...card, overflow: 'hidden' }}>
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={FileMinus} noun="notes"
            hint="Raise one against an invoice or bill when goods come back or a rate is corrected." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                  {['Note', 'Type', 'Party', 'Against', 'Total', 'Reason', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', textAlign: h === 'Total' ? 'right' : undefined }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {q.rows.map(n => (
                  /* The whole row opens the note, as the invoice list does. */
                  <tr key={n.id} data-note-row style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                      onClick={() => navigate(`/credit-debit-notes/${n.id}`)}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{n.note_number}</td>
                    <td style={{ padding: '11px 14px' }}><span style={typeBadge(n.note_type)}>{n.note_type}</span></td>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.party_name || '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>{n.ref_number || '—'}</td>
                    <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{rupee(n.total)}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.reason || '—'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/credit-debit-notes/${n.id}`)} title="View" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 6 }}><Eye size={15} /></button>
                      {/* Hidden when the API would refuse it anyway. */}
                      {canDelete && (
                        <button onClick={() => del(n)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination q={q} />
    </div>
  );
}

/* Compact in the tile (₹16.03 L), exact in the tooltip; FitNumber keeps
   whatever is left inside the tile on a narrow screen. */
const Kpi = ({ card, label, value, tone, note, exact }) => (
  <div style={{ ...card, padding: 18, minWidth: 0 }}>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <FitNumber exact={exact} style={{ fontSize: '1.6rem', fontWeight: 800, color: tone || 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</FitNumber>
    {note && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{note}</div>}
  </div>
);
