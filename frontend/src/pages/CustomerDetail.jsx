/* ══════════════════════════════════════════════════════════
   Customer Detail — everything this customer is to us, on one page.

   Note that "what they buy" and "do they pay on time" are DERIVED from
   order and payment history rather than typed into a field. A typed
   "interests" note goes stale the day after someone writes it; the
   transactions never do.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Phone, Mail, MapPin, TrendingUp, AlertTriangle, Clock, ShoppingBag } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const date = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/customers/${id}/summary`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load this customer'))))
      .then(setData).catch(e => setError(e.message));
  }, [id]);

  if (error) return <Wrap><p style={{ color: 'var(--text-muted)' }}>{error}</p></Wrap>;
  if (!data) return <Wrap><p style={{ color: 'var(--text-muted)' }}>Loading…</p></Wrap>;

  const { customer: c, metrics: m, buys, orders, invoices, challans } = data;

  return (
    <Wrap>
      <button onClick={() => navigate('/customers')} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <ArrowLeft size={14} /> All customers
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            <Building2 size={22} style={{ color: 'var(--brand-amber)' }} /> {c.name}
          </h1>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            {c.gstin && <span>GSTIN {c.gstin}</span>}
            {c.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={13} /> {c.phone}</span>}
            {c.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={13} /> {c.email}</span>}
            {c.state && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {c.state}</span>}
          </div>
          {c.tags && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {String(c.tags).split(',').map(t => t.trim()).filter(Boolean).map(t => (
                <span key={t} style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', color: '#b45309', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The judgement calls, before any table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Tile icon={<TrendingUp size={14} />} tone="#2563eb" label="Lifetime billed" value={rupee(m.lifetime_billed)} sub={`${m.orders_count} orders`} />
        <Tile icon={<ShoppingBag size={14} />} tone="#16a34a" label="Received" value={rupee(m.received)} sub={`avg order ${rupee(m.avg_order_value)}`} />
        <Tile icon={<AlertTriangle size={14} />} tone={m.outstanding > 0 ? '#dc2626' : '#6b7280'} label="Outstanding" value={rupee(m.outstanding)}
          sub={m.overdue_count > 0 ? `${m.overdue_count} overdue · ${rupee(m.overdue_amount)}` : 'nothing overdue'} />
        <Tile icon={<Clock size={14} />} tone={m.pays_on_time === false ? '#dc2626' : m.pays_on_time ? '#16a34a' : '#6b7280'}
          label="Pays in"
          value={m.avg_days_to_pay != null ? `${m.avg_days_to_pay} days` : '—'}
          sub={m.agreed_terms_days != null
            ? (m.pays_on_time === false ? `agreed ${m.agreed_terms_days}d — runs late` : `agreed ${m.agreed_terms_days}d`)
            : 'no terms set'} />
      </div>

      {m.over_credit_limit && (
        <div style={{ background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 10, padding: '11px 14px', marginBottom: 16, fontSize: '0.86rem', color: '#dc2626', fontWeight: 600 }}>
          Outstanding {rupee(m.outstanding)} exceeds their credit limit of {rupee(m.credit_limit)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* Derived, not typed */}
        <Card title="What they buy" sub="From actual order history">
          {buys.length === 0 ? <Muted>No orders yet.</Muted> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <tbody>
                {buys.map(b => (
                  <tr key={b.item} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '7px 0' }}>{b.item}</td>
                    <td style={{ padding: '7px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(b.qty).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '7px 0 7px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{b.orders} order{b.orders === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Addresses" sub="Ship-to drives the GST place of supply">
          <Row label="Bill to">{c.billing_address || <Muted>Not set</Muted>}{c.state ? `, ${c.state}` : ''}</Row>
          <Row label="Ship to">{c.shipping_address || <Muted>Same as billing</Muted>}{c.shipping_state ? `, ${c.shipping_state}` : ''}</Row>
          <Row label="Terms">{c.payment_terms_days != null ? `${c.payment_terms_days} days` : <Muted>Not set</Muted>}</Row>
          <Row label="Credit limit">{c.credit_limit != null ? rupee(c.credit_limit) : <Muted>Not set</Muted>}</Row>
        </Card>

        <Card title="Invoices" sub={`${invoices.length} most recent`}>
          {invoices.length === 0 ? <Muted>No invoices yet.</Muted> : invoices.slice(0, 8).map(i => {
            const bal = Number(i.net_amount || 0) - Number(i.amount_paid || 0);
            const late = i.due_date && bal > 0 && new Date(i.due_date) < new Date();
            return (
              <Link key={i.id} to={`/sales-invoices/${i.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '0.84rem', textDecoration: 'none', color: 'inherit' }}>
                <span>{i.invoice_number}<span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}> · {date(i.invoice_date)}</span></span>
                <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {rupee(i.net_amount)}
                  <span style={{ display: 'block', fontSize: '0.72rem', color: late ? '#dc2626' : bal > 0 ? '#b45309' : '#16a34a' }}>
                    {bal > 0 ? `${rupee(bal)} due${late ? ' · overdue' : ''}` : 'paid'}
                  </span>
                </span>
              </Link>
            );
          })}
        </Card>

        <Card title="Orders" sub={`${orders.length} most recent`}>
          {orders.length === 0 ? <Muted>No orders yet.</Muted> : orders.slice(0, 8).map(o => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '0.84rem' }}>
              <span>{o.order_number}</span>
              <span style={{ color: 'var(--text-muted)' }}>{o.status} · {date(o.order_date || o.created_at)}</span>
            </div>
          ))}
        </Card>

        {challans.length > 0 && (
          <Card title="Dispatches" sub={`${challans.length} most recent`}>
            {challans.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '0.84rem' }}>
                <span>{d.challan_number}</span>
                <span style={{ color: 'var(--text-muted)' }}>{d.status} · {date(d.challan_date)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Wrap>
  );
}

const Wrap = ({ children }) => <div style={{ maxWidth: 1100 }}>{children}</div>;
const Muted = ({ children }) => <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{children}</span>;

const Card = ({ title, sub, children }) => (
  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</div>
    {sub && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 8 }}>{sub}</div>}
    {children}
  </div>
);

const Row = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: '1px solid var(--border-subtle)', fontSize: '0.84rem' }}>
    <span style={{ minWidth: 92, color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ flex: 1 }}>{children}</span>
  </div>
);

const Tile = ({ icon, tone, label, value, sub }) => (
  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '13px 15px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: tone }}>{icon} {label}</div>
    <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);
