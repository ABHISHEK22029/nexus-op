import React, { useState, useEffect } from 'react';
import { Wallet, X, IndianRupee, Building2, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const AGE = [['0-30', '#10b981'], ['31-60', '#f59e0b'], ['61-90', '#f97316'], ['90+', '#ef4444']];
const PSTATUS_COLOR = { Unpaid: '#ef4444', 'Partially Paid': '#f59e0b', Paid: '#10b981' };

export default function Payables() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payBill, setPayBill] = useState(null);
  const [form, setForm] = useState({ amount: '', mode: 'Bank', reference: '', paidDate: '' });

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch(`${API}/payables`).then(r => r.ok ? r.json() : null);
      setData(d);
    } catch { setData(null); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openPay = (b) => { setPayBill(b); setForm({ amount: String(b.outstanding), mode: 'Bank', reference: '', paidDate: '' }); };
  const submitPay = async () => {
    if (!(Number(form.amount) > 0)) { toast.error('Enter an amount'); return; }
    try {
      const res = await fetch(`${API}/grn-bills/${payBill.id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Paid — bill is now ${d.paymentStatus}`);
      setPayBill(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <Wallet size={24} style={{ color: 'var(--brand-amber)' }} /> Payables
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>What you owe your vendors — outstanding bills, ageing, and payments.</p>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : !data ? (
        <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Could not load payables.</div>
      ) : (
        <>
          {/* summary + ageing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 14 }}>
            <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>Total payable</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-amber)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{rupee(data.totalOutstanding)}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>across {data.billCount} bill{data.billCount === 1 ? '' : 's'}</div>
            </div>
            <div style={{ ...card, padding: 20 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 12 }}>Ageing</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {AGE.map(([k, c]) => (
                  <div key={k} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 10, background: 'var(--bg-elevated)', borderTop: `3px solid ${c}` }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>{k} days</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{rupee(data.ageing[k])}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* vendor rollup */}
          {data.vendors.length > 0 && (
            <div style={{ ...card, padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', marginBottom: 10 }}>Top vendors owed</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {data.vendors.slice(0, 6).map(v => (
                  <div key={v.vendorId || v.vendor} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '8px 12px' }}>
                    <Building2 size={15} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{v.vendor}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-amber)', fontSize: '0.85rem' }}>{rupee(v.outstanding)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* outstanding bills */}
          <div style={{ ...card, overflow: 'hidden' }}>
            {data.bills.length === 0 ? (
              <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Wallet size={38} style={{ opacity: 0.35, marginBottom: 10 }} />
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Nothing outstanding 🎉</div>
                <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Vendor bills appear here after you generate a GRN bill (Procurement → GRN).</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                    {['Bill', 'Vendor', 'Due', 'Net', 'Paid', 'Outstanding', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.bills.map(b => {
                    const overdue = b.age_days > 0;
                    return (
                      <tr key={b.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{b.bill_number}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{b.vendor_name || '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: '0.82rem', color: overdue ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          {b.due_date ? String(b.due_date).slice(0, 10) : String(b.bill_date).slice(0, 10)}
                          {overdue && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, fontSize: '0.72rem', fontWeight: 700 }}><AlertTriangle size={11} /> {b.age_days}d</span>}
                        </td>
                        <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{rupee(b.net_amount)}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{rupee(b.amount_paid)}</td>
                        <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text-primary)' }}>{rupee(b.outstanding)}</td>
                        <td style={{ padding: '11px 14px' }}><span style={{ fontSize: '0.72rem', fontWeight: 700, color: PSTATUS_COLOR[b.payment_status], background: (PSTATUS_COLOR[b.payment_status] || '#888') + '1f', padding: '3px 9px', borderRadius: 999 }}>{b.payment_status}</span></td>
                        <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                          <button onClick={() => openPay(b)} className="btn-primary btn-sm" style={{ padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}><IndianRupee size={13} /> Pay</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* pay modal */}
      {payBill && (
        <div onClick={() => setPayBill(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, ...card, boxShadow: 'var(--shadow-md)', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Record payment</div>
              <button onClick={() => setPayBill(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: 16 }}>{payBill.bill_number} · {payBill.vendor_name} · outstanding <b style={{ color: 'var(--text-primary)' }}>{rupee(payBill.outstanding)}</b></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Amount ₹ *</label><input style={input} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label style={lbl}>Mode</label>
                <select style={input} value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                  {['Bank', 'NEFT', 'UPI', 'Cheque', 'Cash'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Date</label><input style={input} type="date" value={form.paidDate} onChange={e => setForm({ ...form, paidDate: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Reference</label><input style={input} value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="UTR / cheque no." /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={submitPay} className="btn-primary btn-sm">Record payment</button>
              <button onClick={() => setPayBill(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
