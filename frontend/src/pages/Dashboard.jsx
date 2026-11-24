import React, { useState, useEffect, useCallback } from 'react';
import SetupReadiness from '../components/SetupReadiness';
import axios from 'axios';
import {
  Users, ShoppingCart, Package, TrendingUp, Receipt,
  AlertTriangle, Activity, BarChart3, ChevronRight, RefreshCw, Clock,
  IndianRupee, LayoutDashboard, Wallet, CheckCircle2, Truck, PackageCheck,
  Building2, Undo2, ClipboardList, Ruler, Flag, Bell, FileText, Send,
} from 'lucide-react';
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useTheme } from '../context/ThemeContext';
import FitNumber from '../components/FitNumber';
import { fmtCompactINR, fmtCompactQty, fmtINR, fmtQty } from '../lib/format';
import '../styles/dashboard.css';

/* ── Smart number formatters ── */
/* `n == null` means the request has not answered yet, and that is not the
   same statement as zero. Both of these used to coerce undefined to 0, so
   for the eight seconds this page takes to load it told you that you had
   no vendors, no purchase orders and no stock — with the numbers styled
   exactly like real ones. An em-dash says "not known yet"; 0 is a claim. */
/* Lakh and crore through lib/format, the same on every tile in the app;
   the exact figure goes in the tile's tooltip. */
const known = (n) => n != null && Number.isFinite(Number(n));
const fmtCrore = (n) => (known(n) ? fmtCompactINR(n) : '—');
const fmtNum = (n) => (known(n) ? fmtCompactQty(n) : '—');
const exactINR = (n) => (known(n) ? fmtINR(n) : undefined);
const exactNum = (n) => (known(n) ? fmtQty(n) : undefined);

/* ── Status colours ── */
const STATUS_COLORS = {
  Pending: '#94a3b8', Approved: '#3b82f6', Dispatched: '#f59e0b',
  'Partially Received': '#8b5cf6', Delivered: '#10b981', Cancelled: '#cbd5e1',
};
const STATUS_ORDER = ['Pending', 'Approved', 'Dispatched', 'Partially Received', 'Delivered', 'Cancelled'];

/* What each kind of activity is called, and its mark. Icons rather than
   emoji, which rendered differently on every machine and looked like
   stickers next to the figures. */
const TYPE_CONFIG = {
  PO_CREATED: { color: '#F59E0B', icon: ShoppingCart, label: 'Purchase order raised' },
  PO_APPROVED: { color: '#3B82F6', icon: CheckCircle2, label: 'Purchase order approved' },
  PO_APPROVAL: { color: '#3B82F6', icon: CheckCircle2, label: 'Sign-off' },
  PO_DISPATCHED: { color: '#8B5CF6', icon: Send, label: 'Sent to the vendor' },
  GRN: { color: '#10B981', icon: PackageCheck, label: 'Goods received' },
  GRN_RECEIVED: { color: '#10B981', icon: PackageCheck, label: 'Goods received' },
  BILL_GENERATED: { color: '#EF4444', icon: Receipt, label: 'Bill' },
  BILL_SUBMITTED: { color: '#F43F5E', icon: Receipt, label: 'Bill submitted' },
  BILL_APPROVED: { color: '#22C55E', icon: Receipt, label: 'Bill approved' },
  BILL_PAID: { color: '#22C55E', icon: Wallet, label: 'Paid' },
  PAYMENT_REVERSED: { color: '#F59E0B', icon: Undo2, label: 'Payment reversed' },
  INDENT_CREATED: { color: '#F97316', icon: ClipboardList, label: 'Indent' },
  INDENT_UPDATED: { color: '#EC4899', icon: ClipboardList, label: 'Indent updated' },
  MB_ENTRY: { color: '#06B6D4', icon: Ruler, label: 'Measurement' },
  MILESTONE_UPDATED: { color: '#A78BFA', icon: Flag, label: 'Milestone' },
  VENDOR_ADDED: { color: '#84CC16', icon: Building2, label: 'Vendor added' },
  VENDOR_UPDATED: { color: '#84CC16', icon: Building2, label: 'Vendor updated' },
  DISPATCH: { color: '#8B5CF6', icon: Truck, label: 'Dispatched' },
  INVOICE: { color: '#3B82F6', icon: FileText, label: 'Invoice' },
};

/* ══════════════════════════════════════════════════════════
   KPI CARD

   One shape for every figure on the page: icon and label, the figure, one
   line about it, and "View details" at the foot. The line is always there
   (empty if there is nothing to say) and the foot is pinned to the bottom,
   so every card in a row lines up with its neighbours — the figures on one
   line, the notes on the next, the links along the bottom. They used to
   step up and down wherever one card had a note and the next did not.
   Layout and hover: styles/dashboard.css.
   ══════════════════════════════════════════════════════════ */
const KpiCard = ({ title, value, exact, sub, icon: Icon, accent, link, alert = false }) => {
  const card = (
    <div className="dash-kpi" style={{ '--accent': accent }}>
      <div className="dash-kpi-top">
        <span className="dash-kpi-icon"><Icon size={17} /></span>
        <span className="dash-kpi-label" title={title}>{title}</span>
      </div>
      <div className="dash-kpi-value">
        <FitNumber exact={exact}>{value || '—'}</FitNumber>
      </div>
      <div className={`dash-kpi-sub${alert ? ' is-alert' : ''}`}>{sub || '\u00A0'}</div>
      {link && <div className="dash-kpi-foot">View details <ChevronRight size={12} /></div>}
    </div>
  );
  return link ? <Link to={link} className="dash-kpi-link">{card}</Link> : card;
};

/* A row of cards under its own heading. */
const Group = ({ title, note, children }) => (
  <section className="dash-group" aria-label={title}>
    <div className="dash-group-head">
      <h2 className="dash-group-title">{title}</h2>
      {note && <span className="dash-group-note">{note}</span>}
    </div>
    <div className="dash-kpis">{children}</div>
  </section>
);

/* ══════════════════════════════════════════════════════════
   SECTION HEADER — consistent card title style
   ══════════════════════════════════════════════════════════ */
const SectionHeader = ({ icon: Icon, title, action }) => (
  <div className="dash-panel-head">
    <h2 className="dash-panel-title">
      <span className="dash-panel-icon" aria-hidden="true"><Icon size={16} /></span>
      {title}
    </h2>
    {action}
  </div>
);

/* ══════════════════════════════════════════════════════════
   ACTIVITY FEED ITEM
   ══════════════════════════════════════════════════════════ */
const ago = (t) => {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  const d = Math.floor(diff / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
const FeedItem = ({ activity }) => {
  const cfg = TYPE_CONFIG[activity.type] || { color: '#94a3b8', icon: Bell, label: String(activity.type || 'Activity').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) };
  const Icon = cfg.icon;
  return (
    <div className="dash-feed-item" style={{ '--feed': cfg.color }}>
      <span className="dash-feed-icon" aria-hidden="true"><Icon size={15} /></span>
      <div className="dash-feed-text">
        <div className="dash-feed-what">{activity.description}</div>
        <div className="dash-feed-meta">{cfg.label} · {ago(activity.timestamp)}</div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   CUSTOM CHART TOOLTIP
   ══════════════════════════════════════════════════════════ */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: '12px', padding: '12px 16px', fontSize: '0.78rem',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
const Dashboard = () => {
  const { activeProject, projectQuery, ready } = useProject();
  const { isDark } = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!ready) return;   // wait for the remembered scope before the first fetch
    try {
      setLoading(true);
      /* No projectId means "all my work". The endpoint used to refuse
         without one, which is why this bailed out here and left the first
         screen after sign-in permanently empty for anyone not running
         projects. */
      const res = await axios.get(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/dashboard${projectQuery()}`);
      setStats(res.data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
    /* `ready` too: when the remembered scope arrived after the first render,
       nothing ran the fetch again and the tiles stayed on "—". */
  }, [activeProject, ready]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    const iv = setInterval(fetchStats, 60000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  /* S-curve, from the project's milestones only. With none it used to draw
     an invented curve — twelve months of "planned" and "actual" that were
     a formula, not the business — under a note asking for milestones. A
     fabricator has no milestones, so it was a 460px picture of nothing.
     Now the chart is there when there is something real to draw. */
  const sCurveData = React.useMemo(() => {
    if (!stats?.milestones?.length) return [];
    return stats.milestones.map((m, i) => ({
      label: m.name?.substring(0, 8) || `MS-${i + 1}`,
      Planned: Number(m.plannedPercent || 0),
      Actual: Number(m.actualPercent || 0) || null,
    }));
  }, [stats]);

  /* PO pie */
  const pieData = React.useMemo(() => {
    if (!stats?.distribution?.length) return [];
    return stats.distribution.map(d => ({ name: d.status, value: Number(d.count) }));
  }, [stats]);

  /* Sales money, from the invoices (see /dashboard). */
  const sales = stats?.sales;

  /* Overall financial health */
  const utilizationPct = stats?.totalBilled && stats?.netPaid
    ? Math.round((stats.netPaid / stats.totalBilled) * 100)
    : 0;

  const deliveryRate = stats?.totalPOs && stats?.deliveredPOs
    ? Math.round((stats.deliveredPOs / stats.totalPOs) * 100)
    : 0;

  /* The "Select a project from the top bar" wall used to live here. It was
     the first thing a new user saw and there was nothing they could do about
     it — a fabricator has no projects to select. The dashboard now answers
     for whatever scope is chosen, project or not. */

  /* Chart colours that work in both themes */
  const gridStroke = isDark ? 'rgba(255,255,255,0.05)' : 'hsl(32,20%,88%)';
  const axisStroke = isDark ? '#555' : '#aaa';

  return (
    <div className="dash">

      {/* ══ HEADER ══════════════════════════════════════════
          The same title row as every other screen. It was a card of its own
          with an orange strip and an "eyebrow", which with the setup banner
          above it put two loud blocks between the person and the figures. */}
      <header className="dash-head">
        <div className="dash-head-main">
          <h1 className="dash-title">
            <LayoutDashboard size={22} className="dash-title-icon" aria-hidden="true" />
            {activeProject ? activeProject.name : 'Dashboard'}
          </h1>
          {/* The client / type / status strip describes a project. With none
              selected there is nothing true to put there. */}
          {!activeProject ? (
            <p className="dash-sub">Sales, purchases and stock across the business</p>
          ) : (
            <p className="dash-sub" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span>Client: <strong style={{ color: 'var(--text-secondary)' }}>{activeProject?.clientName}</strong></span>
              <span style={{ textTransform: 'capitalize' }}>· {activeProject?.type}</span>
              <span style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
                background: 'hsl(158,64%,52%,0.12)', color: 'var(--accent-emerald)', border: '1px solid hsl(158,64%,52%,0.3)',
              }}>{activeProject?.status}</span>
            </p>
          )}
        </div>
        <div className="dash-head-side">
          {lastRefresh && <span className="dash-refreshed">Updated {lastRefresh.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>}
          <button onClick={fetchStats} disabled={loading} className="dash-refresh" aria-label="Refresh the figures">
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} aria-hidden="true" />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* What is missing before the figures can mean anything; gone once
          everything is in place. */}
      <SetupReadiness />

      {/* ══ MONEY ═══════════════════════════════════════════
          First, because it is the first question. From the sales invoices;
          "Total Billed" used to read a contracting job's RA bills, so a
          fabricator saw ₹0 however much they had sold. */}
      <Group title="Money" note={sales ? `${sales.fyLabel}, April to March` : undefined}>
        <KpiCard title="Billed this year" value={fmtCrore(sales?.billed)} exact={exactINR(sales?.billed)} icon={Receipt} accent="#3B82F6" link="/sales-invoices" sub="Invoices issued" />
        <KpiCard title="Received this year" value={fmtCrore(sales?.received)} exact={exactINR(sales?.received)} icon={TrendingUp} accent="#16A34A" link="/sales-invoices" sub="Payments in" />
        <KpiCard title="Outstanding" value={fmtCrore(sales?.outstanding)} exact={exactINR(sales?.outstanding)} icon={IndianRupee} accent="#D97706" link="/sales-invoices" sub="Owed by customers today" />
        <KpiCard title="Overdue" value={fmtCrore(sales?.overdueAmount)} exact={exactINR(sales?.overdueAmount)} icon={Clock} accent="#DC2626" link="/sales-invoices"
          alert={Number(sales?.overdueCount) > 0}
          sub={sales ? (Number(sales.overdueCount) > 0 ? `${sales.overdueCount} invoice${sales.overdueCount === 1 ? '' : 's'} past due` : 'Nothing past due') : undefined} />
      </Group>

      {/* ══ PURCHASING AND STOCK ═════════════════════════════
          "POs Delivered" had a card of its own; it is the purchase-order
          card's note now, which keeps the row at four. */}
      <Group title="Purchasing and stock">
        <KpiCard title="Active vendors" value={fmtNum(stats?.totalVendors)} exact={exactNum(stats?.totalVendors)} icon={Users} accent="#3B82F6" link="/vendors" sub="Who you buy from" />
        <KpiCard title="Purchase orders" value={fmtNum(stats?.totalPOs)} exact={exactNum(stats?.totalPOs)} icon={ShoppingCart} accent="#8B5CF6" link="/po"
          sub={known(stats?.totalPOs) ? (Number(stats.totalPOs) > 0 ? `${fmtNum(stats?.deliveredPOs ?? 0)} received in full` : 'None raised yet') : undefined} />
        {/* What is owed to vendors. It replaces "Units ordered", which added
            kilos to pieces to metres — a number with no unit. */}
        <KpiCard title="Owed to vendors" value={fmtCrore(stats?.payables?.outstanding)} exact={exactINR(stats?.payables?.outstanding)} icon={Wallet} accent="#0891B2" link="/payables"
          sub={known(stats?.payables?.count) ? `${stats.payables.count} unpaid bill${stats.payables.count === 1 ? '' : 's'}` : undefined} />
        <KpiCard title="Stock items" value={fmtNum(stats?.inventoryCount)} exact={exactNum(stats?.inventoryCount)} icon={Package} accent="#D97706" link="/inventory" sub="Items on Stock on hand" />
      </Group>

      {/* ══ CONTRACTS ═══════════════════════════════════════
          RA bills and indents belong to contracting work. Only for a company
          that has them; a fabricator saw "Open Indents 0" on every visit. */}
      {(stats?.hasRaBills || Number(stats?.openIndents) > 0) && (
        <Group title="Contracts">
          {stats?.hasRaBills && <>
            <KpiCard title="RA bills raised" value={fmtCrore(stats?.totalBilled)} exact={exactINR(stats?.totalBilled)} icon={Receipt} accent="#DC2626" link="/bills" sub="Gross amount raised" />
            <KpiCard title="RA bills released" value={fmtCrore(stats?.netPaid)} exact={exactINR(stats?.netPaid)} icon={TrendingUp} accent="#16A34A" link="/bills" sub={`${utilizationPct}% of the amount raised`} />
          </>}
          <KpiCard title="Open indents" value={fmtNum(stats?.openIndents)} exact={exactNum(stats?.openIndents)} icon={AlertTriangle} accent="#EA580C" link="/indent" sub="Waiting to be ordered" />
        </Group>
      )}

      {/* ══ S-CURVE, from real milestones only ════════════════

         The "ORR Live Deployment Map" that used to sit beside this is gone.
         It drew Hyderabad's Outer Ring Road from coordinates hardcoded in
         the component, with invented work packages and depots, under a
         pulsing "LIVE" badge. Not one value came from the database. */}
      {sCurveData.length > 0 && (
        <div className="dash-panel dash-curve">
          <SectionHeader
            icon={BarChart3} iconColor="#3B82F6"
            title="S-Curve: Progress vs Plan"
            action={
              <Link to="/milestones" style={{
                fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-amber)',
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                Update <ChevronRight size={13} />
              </Link>
            }
          />

          {/* Legend pills */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            {[{ color: '#3B82F6', label: 'Planned', dash: true }, { color: '#22C55E', label: 'Actual' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <div style={{ width: '20px', height: '2px', background: l.color, borderRadius: '1px', borderTop: l.dash ? `2px dashed ${l.color}` : 'none', opacity: l.dash ? 0.8 : 1 }} />
                {l.label}
              </div>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: '#EF4444', fontWeight: 600 }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} /> Today
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sCurveData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradPlanned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" stroke={axisStroke} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={axisStroke} fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  x={sCurveData[Math.min(7, sCurveData.length - 1)]?.label}
                  stroke="#EF4444" strokeDasharray="4 4" strokeWidth={1.5}
                />
                <Area type="monotone" dataKey="Planned" stroke="#3B82F6" strokeWidth={2}
                  strokeDasharray="6 4" fill="url(#gradPlanned)" dot={false} connectNulls />
                <Area type="monotone" dataKey="Actual" stroke="#22C55E" strokeWidth={2.5}
                  fill="url(#gradActual)" dot={{ r: 4, fill: '#22C55E', strokeWidth: 0 }}
                  connectNulls activeDot={{ r: 6, fill: '#22C55E' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══ PO MIX + RECENT ACTIVITY ═════════════════════════
          Side by side when there is room, stacked when there is not; the
          fixed 360px column used to push the page sideways on a phone. */}
      <div className="dash-bottom">

        {/* Purchase orders by status: a row each with its share. It was a
            donut, which with one or two orders drew a plain ring and said
            nothing. */}
        <div className="dash-panel dash-span-1">
          <SectionHeader icon={ShoppingCart} title="Purchase orders" />
          {pieData.length > 0 ? (() => {
            const total = pieData.reduce((sum, x) => sum + x.value, 0);
            const rows = [...pieData].sort((a, b) => (STATUS_ORDER.indexOf(a.name) + 99) % 99 - (STATUS_ORDER.indexOf(b.name) + 99) % 99);
            return (
              <>
                <div className="dash-status" data-po-status>
                  {rows.map(d => {
                    const color = STATUS_COLORS[d.name] || '#94a3b8';
                    const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                    return (
                      <div key={d.name} className="dash-status-row">
                        <span className="dash-status-name"><span className="dash-status-dot" style={{ background: color }} />{d.name}</span>
                        <span className="dash-status-count">{d.value}</span>
                        <div className="dash-status-bar" aria-hidden="true"><span style={{ width: `${pct}%`, background: color }} /></div>
                      </div>
                    );
                  })}
                </div>
                <div className="dash-status-total"><span>All purchase orders</span><b>{total}</b></div>
              </>
            );
          })() : (
            <div className="dash-panel-empty">
              <ShoppingCart size={28} style={{ opacity: 0.2 }} aria-hidden="true" />
              <p style={{ margin: 0 }}>No purchase orders yet. <Link to="/purchase-orders">Raise one</Link> when you buy material.</p>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="dash-panel dash-span-3">
          <SectionHeader icon={Activity} title="Recent activity"
            action={<Link to="/activity" className="dash-panel-link">View all <ChevronRight size={13} /></Link>} />
          <div className="dash-feed">
            {stats?.recentActivities?.length > 0 ? (
              stats.recentActivities.map((a) => <FeedItem key={a.id} activity={a} />)
            ) : (
              <div className="dash-panel-empty">
                <Clock size={28} style={{ opacity: 0.2 }} aria-hidden="true" />
                <p style={{ margin: 0 }}>Nothing yet. This fills up as you take <Link to="/customer-orders">orders</Link>, buy material and send invoices.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ BOQ EXECUTION PROGRESS ════════════════════════ */}
      {stats?.boqSummary?.length > 0 && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '20px', padding: '24px', marginBottom: '20px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <SectionHeader
            icon={BarChart3} iconColor="#F59E0B"
            title="BOQ Execution Progress"
            action={
              <Link to="/boq" style={{
                fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-amber)',
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                Full BOQ <ChevronRight size={13} />
              </Link>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {stats.boqSummary.slice(0, 5).map(item => {
              const pct = item.estimatedQuantity > 0
                ? Math.min(100, Math.round((item.executedQuantity / item.estimatedQuantity) * 100))
                : 0;
              const barColor = pct >= 75 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#3B82F6';
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.itemCode}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.description}</span>
                    </div>
                    <div style={{
                      height: '8px', background: isDark ? 'rgba(255,255,255,0.07)' : 'hsl(32,20%,90%)',
                      borderRadius: '99px', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                        borderRadius: '99px', transition: 'width 900ms cubic-bezier(0.34,1.1,0.64,1)',
                      }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: barColor, lineHeight: 1, marginBottom: '3px' }}>{pct}%</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {fmtNum(item.executedQuantity)} / {fmtNum(item.estimatedQuantity)} {item.unit}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spin animation for refresh button */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default Dashboard;
