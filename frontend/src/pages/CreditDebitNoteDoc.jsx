/* ══════════════════════════════════════════════════════════
   Credit / Debit Note — the only lawful way to change an issued invoice.

   Section 31 forbids editing an invoice once it has gone out; a correction
   travels as a separate note that points back at the original. That pointer
   is the whole document: Section 34 read with Rule 53(1A) requires the
   original invoice's NUMBER and DATE on the face of the note, because the
   date is what ties it to a tax period in the GSTR-1 credit note table.

   The note carried the number but not the date. Both print now, and a
   missing reference is called out on screen rather than discovered by the
   customer's accounts team.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Pencil } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermissions } from '../context/PermissionContext';
import { useDocEdit, EditBar, Field, Spot, onSheetClick, confirmDiscard } from '../components/DocEdit';
import Attachments from '../components/Attachments';
import {
  CompanyHeader, Party, SignatureBlock, DocFooter, ComplianceWarning, fmtDate, ItemText, StatusPill,
} from '../components/DocumentKit';
import { amountInWords } from '../lib/amountInWords';
import { docFileName, printAs } from '../lib/documentPdf';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Edited on its own page (components/DocEdit). A note is issued when it is
   made, so its lines and amounts stay; what explains it can be put right —
   the server's NOTE_FIELDS (controllers/CreditDebitNoteController). */
const str = (v) => (v == null ? '' : String(v));
const noteValues = (n) => ({ reason: str(n.reason), notes: str(n.notes), ref_date: str(n.ref_date).slice(0, 10), ref_number: str(n.ref_number) });

export default function CreditDebitNoteDoc() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { can } = usePermissions();
  const ed = useDocEdit();
  const [n, setN] = useState(null);
  const [err, setErr] = useState(false);

  const load = () => fetch(`${API}/credit-debit-notes/${id}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setN).catch(() => setErr(true));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  const canWrite = can('credit-debit-notes', 'write');
  const begin = (field) => { if (n && canWrite) ed.start(noteValues(n), field); };

  if (err) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Note not found. <button onClick={() => navigate('/credit-debit-notes')} className="btn-secondary" style={{ marginLeft: 8 }}>Back</button></div>;
  if (!n) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>;

  const co = n.company || {}; const party = n.party || {};
  const title = n.note_type === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE';

  /* ── Editing on the page ── */
  const d = ed.editing ? ed.draft : null;
  const keys = n.ref_id ? ['reason', 'notes', 'ref_date'] : ['reason', 'notes', 'ref_date', 'ref_number'];
  const editable = (k) => !!d && keys.includes(k);
  const spotOn = (k) => !ed.editing && canWrite && keys.includes(k);
  const refLate = !!d && !!d.ref_date && !!n.note_date && d.ref_date > str(n.note_date).slice(0, 10);
  const problems = !d ? [] : [refLate && 'The original document cannot be dated after this note.'].filter(Boolean);
  const save = async () => {
    if (!d || ed.saving) return;
    if (problems.length) { ed.setTried(true); return; }
    const body = {};
    for (const k of ed.changed(keys)) body[k] = String(d[k] ?? '').trim() || null;
    if (!Object.keys(body).length) { ed.stop(); toast.info('Nothing was changed'); return; }
    ed.setSaving(true);
    try {
      const res = await fetch(`${API}/credit-debit-notes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { ed.setError(r.error || 'Could not save the note'); ed.setSaving(false); return; }
      await load();
      ed.stop();
      toast.success(`${n.note_number} saved — the print shows the change`);
    } catch (e) { ed.setError(`Could not save: ${e.message}`); ed.setSaving(false); }
  };
  const cancelEdit = async () => { if (await confirmDiscard(ed, confirm)) ed.stop(); };
  const scope = 'Issued: the reason, the notes and the original document’s date' + (n.ref_id ? '' : ' and number') + ' can still change. To change the amounts, raise another note.';

  /* The reference to the original invoice is what makes this note lawful,
     so its absence is a compliance gap, not a cosmetic one. */
  const gaps = [
    !co.gstin && 'Your GSTIN (set it in Company Profile)',
    !party.gstin && `${n.party_type === 'vendor' ? 'Vendor' : 'Customer'} GSTIN`,
    !n.ref_number && 'Original invoice number — Section 34 requires this note to reference it',
    !n.ref_date && 'Original invoice date — needed to report this note in the right tax period',
    !n.reason && 'Reason for the note',
  ].filter(Boolean);
  const th = { padding: '9px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' };
  const td = { padding: '9px 10px', fontSize: '0.85rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' };
  const totRow = (l, v, bold) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: bold ? '1rem' : '0.85rem', fontWeight: bold ? 800 : 500, color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
      <span>{l}</span><span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', marginLeft: 16 }}>{v}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/credit-debit-notes')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={15} /> All Notes</button>
          <StatusPill status={n.status} />
        </div>
        {!ed.editing && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canWrite && (
              <button onClick={() => begin()} data-doc-edit className="btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Change the reason, the notes or the original document's date">
                <Pencil size={15} /> Edit note
              </button>
            )}
            <button onClick={() => printAs(docFileName(n.note_type === 'credit' ? 'Credit Note' : 'Debit Note', n.note_number, (n.party || {}).name))} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Printer size={15} /> Print</button>
          </div>
        )}
      </div>

      {ed.editing && <EditBar ed={ed} what={n.note_number} scope={scope} problems={problems} onSave={save} onCancel={cancelEdit} />}

      <div className="no-print"><ComplianceWarning gaps={gaps} /></div>

      <div className="doc-scroll">
      <div className="doc-sheet" data-editing={ed.editing ? 'true' : undefined} onClick={onSheetClick(ed, begin)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 32 }}>
        <CompanyHeader
          company={co}
          title={title}
          meta={[
            ['No.', n.note_number],
            ['Date', fmtDate(n.note_date)],
          ]}
        />

        {/* The reference block. Without both the number AND the date this
            note cannot be reported against the right tax period. */}
        <div data-note-ref style={{ border: '1px solid #000', padding: '9px 13px', margin: '16px 0', fontSize: '0.85rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: 5 }}>
            Issued against original document
          </div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span>Number: <strong>
              {/* Red is for the person preparing it; on paper it is a blank. */}
              {editable('ref_number') ? <Field name="ref_number" label="Original document number" value={d.ref_number} onChange={v => ed.set('ref_number', v)} maxLength={60} style={{ width: 160 }} /> : n.ref_number
                ? (n.ref_id && /invoice|bill/.test(String(n.ref_type || ''))
                  ? <Link to={String(n.ref_type).includes('bill') ? `/grn-bills/${n.ref_id}` : `/sales-invoices/${n.ref_id}`} data-note-ref-link style={{ color: 'inherit' }}>{n.ref_number}</Link>
                  : n.ref_number)
                : <Spot field="ref_number" on={spotOn('ref_number')}><em className="print:hidden" style={{ color: '#dc2626', fontFamily: 'inherit' }}>not referenced</em><span className="print-only">—</span></Spot>}
            </strong></span>
            <span>Dated: <strong>
              {editable('ref_date')
                ? <Field type="date" name="ref_date" label="Original document date" value={d.ref_date} onChange={v => ed.set('ref_date', v)} invalid={ed.tried && refLate} />
                : <Spot field="ref_date" on={spotOn('ref_date')}>{n.ref_date ? fmtDate(n.ref_date) : <><em className="print:hidden" style={{ color: '#dc2626', fontWeight: 400 }}>not recorded</em><span className="print-only">—</span></>}</Spot>}
            </strong></span>
            {n.ref_type && <span style={{ color: 'var(--text-muted)' }}>({String(n.ref_type).replace(/_/g, ' ')})</span>}
          </div>
        </div>

        {/* The party and the reason, in one closed box — as on the other documents. */}
        <div className="doc-parties">
          <Party
            title={n.party_type === 'vendor' ? 'Vendor' : 'Customer'}
            name={party.name}
            address={party.billing_address || party.address}
            state={party.state}
            gstin={party.gstin}
            required
          />
          <div className="inv-party">
            <div className="inv-party-title">Reason</div>
            <div className="inv-party-detail doc-wrap" style={{ fontSize: '0.85rem' }}>
              {editable('reason')
                ? <Field as="textarea" name="reason" label="Reason" minRows={3} placeholder="e.g. 2 sets short-supplied" value={d.reason} onChange={v => ed.set('reason', v)} />
                : <Spot field="reason" on={spotOn('reason')} block>{n.reason || <><em className="print:hidden" style={{ color: '#dc2626' }}>No reason recorded — a note without a stated reason invites a query.</em><span className="print-only">—</span></>}</Spot>}
            </div>
          </div>
        </div>

        <div>
          <table className="doc-items" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Description</th>
              <th style={{ ...th, textAlign: 'left' }}>HSN/SAC</th>
              <th style={{ ...th, textAlign: 'center' }}>UOM</th>
              <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Qty</th>
              <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Rate</th>
              <th style={{ ...th, textAlign: 'right', whiteSpace: 'nowrap' }}>Amount</th>
            </tr></thead>
            <tbody>
              {(n.items || []).map((it, i) => (
                <tr key={it.id}>
                  <td style={td}>{i + 1}</td>
                  <td className="doc-wrap" style={{ ...td, verticalAlign: 'top' }}><ItemText text={it.description} /></td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{it.hsn || '—'}</td>
                  <td style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)' }}>{it.uom || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{Number(it.quantity)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{rupee(it.rate)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{rupee(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals to footer: kept whole, and never on a sheet by itself
            (print.css, .doc-closing). */}
        <div className="doc-closing">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <div style={{ minWidth: 300 }}>
            {totRow('Taxable value', rupee(n.sub_total))}
            {n.interstate ? totRow(`IGST (${n.gst_rate}%)`, rupee(n.igst)) : (<>{totRow(`CGST (${n.gst_rate / 2}%)`, rupee(n.cgst))}{totRow(`SGST (${n.gst_rate / 2}%)`, rupee(n.sgst))}</>)}
            <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 6, paddingTop: 6 }}>{totRow('Total', rupee(n.total), true)}</div>
          </div>
        </div>
        {/* Spelled from the total on the page; the stored text could be empty. */}
        <div style={{ marginTop: 14, fontSize: '0.82rem', color: 'var(--text-secondary)' }}><b>In words:</b> {amountInWords(n.total)}</div>
        {editable('notes') ? (
          <div style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <b>Notes:</b>
            <Field as="textarea" name="notes" label="Notes" minRows={2} placeholder="Printed on the note" value={d.notes} onChange={v => ed.set('notes', v)} />
          </div>
        ) : n.notes ? (
          <Spot field="notes" on={spotOn('notes')} block>
            <div className="doc-wrap" data-note-notes style={{ marginTop: 10, fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}><b>Notes:</b> {n.notes}</div>
          </Spot>
        ) : spotOn('notes') && (
          <Spot field="notes" on block><span className="print:hidden" style={{ display: 'inline-block', marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>+ Add notes</span></Spot>
        )}

        <div style={{ border: '1px dashed #9ca3af', borderRadius: 6, padding: '7px 11px', margin: '14px 0', fontSize: '0.75rem', color: '#4b5563', background: '#f9fafb' }}>
          {/* Section 34 notes are the supplier's. A note we send a VENDOR is
              our side of the adjustment; their own note governs the tax. */}
          {n.party_type === 'vendor'
            ? <>Issued to the supplier for the adjustment shown against their invoice referenced above. The supplier's corresponding note under Section 34 governs the tax.</>
            : n.note_type === 'credit'
            ? <>Issued under Section 34(1). The tax liability on the original invoice is reduced to the extent shown, provided the recipient has reversed the corresponding input tax credit.</>
            : <>Issued under Section 34(3). This note increases the taxable value and tax charged on the original invoice referenced above.</>}
        </div>

        <SignatureBlock company={co} />
        <DocFooter company={co} right={n.note_number} />
        </div>
      </div>
      </div>

      {/* Files that belong with this note — the debit note or letter from
          the customer, the return challan. Never printed. */}
      <div className="print:hidden no-print" style={{ marginTop: 16 }}>
        <Attachments entityType="credit_debit_note" entityId={id} label="Documents" compact />
      </div>
    </div>
  );
}
