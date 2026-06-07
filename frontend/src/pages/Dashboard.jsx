import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users, ShoppingCart, CheckCircle, Package, TrendingUp, Receipt,
  AlertTriangle, Map as MapIcon, Activity, ArrowUpRight, ArrowDownRight,
  BarChart3, Layers, ChevronRight, RefreshCw, Clock, Zap, IndianRupee
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { Link } from 'react-router-dom';
import GoogleORRMap from '../components/GoogleORRMap';
import { useProject } from '../context/ProjectContext';
import { useTheme } from '../context/ThemeContext';

/* ── Smart number formatters ── */
const fmtCrore = (n) => {
  const num = Number(n || 0);
  if (num >= 1e7) return `₹${(num / 1e7).toFixed(2)} Cr`;
  if (num >= 1e5) return `₹${(num / 1e5).toFixed(1)} L`;
  if (num === 0) return '₹0';
  return `₹${num.toLocaleString('en-IN')}`;
};
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');

/* ── Status colours ── */
const STATUS_COLORS = {
  Pending: '#94a3b8', Approved: '#60a5fa',
  Dispatched: '#fbbf24', Delivered: '#34d399',
};

const TYPE_CONFIG = {
  PO_CREATED: { color: '#F59E0B', icon: '📦', label: 'PO Created' },
  PO_APPROVED: { color: '#3B82F6', icon: '✅', label: 'PO Approved' },
  PO_DISPATCHED: { color: '#8B5CF6', icon: '🚚', label: 'Dispatched' },
  GRN_RECEIVED: { color: '#10B981', icon: '📬', label: 'GRN' },
  BILL_GENERATED: { color: '#EF4444', icon: '📄', label: 'Bill' },
  BILL_SUBMITTED: { color: '#F43F5E', icon: '📨', label: 'Submitted' },
  BILL_PAID: { color: '#22C55E', icon: '💰', label: 'Paid' },
  INDENT_CREATED: { color: '#F97316', icon: '📋', label: 'Indent' },
  INDENT_UPDATED: { color: '#EC4899', icon: '🔄', label: 'Updated' },
  MB_ENTRY: { color: '#06B6D4', icon: '📐', label: 'MB Entry' },
  MILESTONE_UPDATED: { color: '#A78BFA', icon: '🎯', label: 'Milestone' },
  VENDOR_ADDED: { color: '#84CC16', icon: '🏢', label: 'Vendor' },
};

/* ══════════════════════════════════════════════════════════
   KPI CARD — Spacious, readable, beautiful
   ══════════════════════════════════════════════════════════ */
const KpiCard = ({ title, value, sub, icon: Icon, accent, link, trend, isCurrency }) => {
  const [hovered, setHovered] = useState(false);
  const card = (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '24px',
        background: 'var(--bg-surface)',
        border: `1px solid ${hovered ? accent + '55' : 'var(--border-subtle)'}`,
        borderRadius: '18px',
        textDecoration: 'none',
        transition: 'all 240ms cubic-bezier(0.34,1.1,0.64,1)',
        position: 'relative',
        overflow: 'hidden',
        cursor: link ? 'pointer' : 'default',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered ? `0 12px 40px ${accent}22` : 'var(--shadow-sm)',
        gap: '0',
      }}
    >
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: '120px', height: '120px',
        background: `radial-gradient(circle at top right, ${accent}22, transparent 65%)`,
        pointerEvents: 'none',
        transition: 'opacity 240ms',
        opacity: hovered ? 1 : 0.6,
      }} />

      {/* Bottom accent bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 240ms',
      }} />

      {/* Top row: icon + trend */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{
          padding: '12px',
          background: `${accent}18`,
          border: `1px solid ${accent}35`,
          borderRadius: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 240ms',
          transform: hovered ? 'scale(1.08)' : 'scale(1)',
        }}>
          <Icon size={22} style={{ color: accent }} />
        </div>
        {trend !== undefined && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '3px',
            fontSize: '0.78rem', fontWeight: 700,
            color: trend >= 0 ? '#22C55E' : '#EF4444',
            background: trend >= 0 ? '#22C55E18' : '#EF444418',
            border: `1px solid ${trend >= 0 ? '#22C55E35' : '#EF444435'}`,
            padding: '3px 10px', borderRadius: '99px',
          }}>
            {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      {/* Label */}
      <div style={{
        fontSize: '0.73rem', fontWeight: 700,
        color: 'var(--text-muted)',
        marginBottom: '8px',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {title}
      </div>

      {/* Value — big and proud */}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: isCurrency ? '1.65rem' : '2.2rem',
        fontWeight: 800,
        color: 'var(--text-primary)',
        lineHeight: 1,
        letterSpacing: '-0.03em',
        wordBreak: 'break-word',
        transition: 'color 240ms',
      }}>
        {value || '—'}
      </div>

      {sub && (
        <div style={{ fontSize: '0.72rem', color: accent, marginTop: '8px', fontWeight: 600 }}>
          {sub}
        </div>
      )}

      {link && (
        <div style={{
          marginTop: '14px',
          paddingTop: '12px',
          borderTop: `1px solid ${hovered ? accent + '25' : 'var(--border-subtle)'}`,
          display: 'flex', alignItems: 'center', gap: '4px',
          fontSize: '0.72rem', fontWeight: 600, color: hovered ? accent : 'var(--text-muted)',
          transition: 'color 200ms',
        }}>
          View details <ChevronRight size={11} />
        </div>
      )}
    </div>
  );
  return link ? <Link to={link} style={{ textDecoration: 'none' }}>{card}</Link> : card;
};

/* ══════════════════════════════════════════════════════════
   SECTION HEADER — consistent card title style
   ══════════════════════════════════════════════════════════ */
const SectionHeader = ({ icon: Icon, iconColor, title, action }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: '10px',
        background: `${iconColor}18`, border: `1px solid ${iconColor}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={17} style={{ color: iconColor }} />
      </div>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
        {title}
      </h2>
    </div>
    {action}
  </div>
);

/* ══════════════════════════════════════════════════════════
   ACTIVITY FEED ITEM
   ══════════════════════════════════════════════════════════ */
const FeedItem = ({ activity, isLast }) => {
  const cfg = TYPE_CONFIG[activity.type] || { color: '#94a3b8', icon: '🔔', label: activity.type };
  const diff = Math.floor((Date.now() - new Date(activity.timestamp).getTime()) / 1000);
  const timeAgo = diff < 60 ? `${diff}s` : diff < 3600 ? `${Math.floor(diff / 60)}m` : diff < 86400 ? `${Math.floor(diff / 3600)}h` : `${Math.floor(diff / 86400)}d`;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      padding: '12px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <div style={{
        flexShrink: 0, width: '34px', height: '34px',
        background: `${cfg.color}15`, border: `1px solid ${cfg.color}35`,
        borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.9rem',
      }}>
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4, marginBottom: '4px' }}>
          {activity.description}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, color: cfg.color,
            background: `${cfg.color}12`, padding: '2px 8px',
            borderRadius: '99px', border: `1px solid ${cfg.color}28`,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{cfg.label}</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{timeAgo} ago</span>
        </div>
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
  const { activeProject } = useProject();
  const { isDark } = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!activeProject) return;
    try {
      setLoading(true);
      const res = await axios.get(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/dashboard?projectId=${activeProject.id}`);
      setStats(res.data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    const iv = setInterval(fetchStats, 60000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  /* S-Curve data */
  const sCurveData = React.useMemo(() => {
    if (!stats?.milestones?.length) {
      return Array.from({ length: 12 }, (_, i) => ({
        label: `M${i + 1}`,
        Planned: Math.round(100 / (1 + Math.exp(-((i - 5) / 2)))),
        Actual: i < 8 ? Math.round(100 / (1 + Math.exp(-((i - 5.5) / 2)))) : null,
      }));
    }
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

  /* Overall financial health */
  const utilizationPct = stats?.totalBilled && stats?.netPaid
    ? Math.round((stats.netPaid / stats.totalBilled) * 100)
    : 0;

  const deliveryRate = stats?.totalPOs && stats?.deliveredPOs
    ? Math.round((stats.deliveredPOs / stats.totalPOs) * 100)
    : 0;

  if (!activeProject) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
        <div style={{ fontSize: '4rem' }}>🏗️</div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Select a project from the top bar to view your dashboard</p>
      </div>
    );
  }

  /* Chart colours that work in both themes */
  const gridStroke = isDark ? 'rgba(255,255,255,0.05)' : 'hsl(32,20%,88%)';
  const axisStroke = isDark ? '#555' : '#aaa';

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', animation: 'fade-in 0.4s ease' }}>

      {/* ══ PROJECT HEADER ══════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '32px', padding: '24px 28px',
        background: isDark
          ? 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(255,122,0,0.06) 100%)'
          : 'linear-gradient(135deg, #fff 0%, hsl(36,60%,96%) 100%)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '20px', position: 'relative', overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Amber top stripe */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, var(--brand-amber), hsl(38,95%,58%), var(--brand-amber))',
        }} />
        {/* Left glow blob */}
        <div style={{
          position: 'absolute', top: '-20px', right: '-20px',
          width: '200px', height: '200px',
          background: 'radial-gradient(circle, hsl(28,100%,54%,0.12), transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px hsl(28,100%,54%,0.35)',
          }}>
            <Zap size={24} color="#fff" fill="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--brand-amber)', marginBottom: '4px' }}>
              Executive Dashboard
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.025em', margin: '0 0 4px' }}>
              {activeProject.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Client: <strong style={{ color: 'var(--text-secondary)' }}>{activeProject.clientName}</strong>
              </span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--border-emphasis)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {activeProject.type}
              </span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--border-emphasis)', flexShrink: 0 }} />
              <span style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
                background: 'hsl(158,64%,52%,0.12)', color: 'var(--accent-emerald)',
                border: '1px solid hsl(158,64%,52%,0.3)',
              }}>
                {activeProject.status}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {lastRefresh && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              ↻ {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchStats} disabled={loading} style={{
            padding: '10px 18px',
            background: loading ? 'var(--bg-elevated)' : 'hsl(28,100%,54%,0.12)',
            border: '1px solid hsl(28,100%,54%,0.3)',
            borderRadius: '10px', color: 'var(--brand-amber)',
            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '7px',
            fontFamily: 'var(--font-body)', transition: 'all 200ms',
          }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ══ 4 PRIMARY KPI CARDS (row 1) ═══════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px', marginBottom: '18px' }}>
        <KpiCard key="vendors" title="Active Vendors" value={fmtNum(stats?.totalVendors)} icon={Users} accent="#3B82F6" link="/vendors" trend={12} />
        <KpiCard key="pos" title="Purchase Orders" value={fmtNum(stats?.totalPOs)} icon={ShoppingCart} accent="#8B5CF6" link="/po" trend={5} />
        <KpiCard key="delivered" title="POs Delivered" value={fmtNum(stats?.deliveredPOs)} icon={CheckCircle} accent="#10B981" link="/po" sub={`${deliveryRate}% delivery rate`} />
        <KpiCard key="inv" title="Inventory SKUs" value={fmtNum(stats?.inventoryCount)} icon={Package} accent="#F59E0B" link="/inventory" />
      </div>

      {/* ══ 4 FINANCIAL KPI CARDS (row 2) ═══════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px', marginBottom: '28px' }}>
        <KpiCard key="billed" title="Total Billed" value={fmtCrore(stats?.totalBilled)} icon={Receipt} accent="#EF4444" link="/bills" isCurrency sub="Gross amount raised" />
        <KpiCard key="paid" title="Net Released" value={fmtCrore(stats?.netPaid)} icon={TrendingUp} accent="#22C55E" link="/bills" isCurrency trend={8} sub={`${utilizationPct}% utilization`} />
        <KpiCard key="indents" title="Open Indents" value={fmtNum(stats?.openIndents)} icon={AlertTriangle} accent="#F97316" link="/indent" />
        <KpiCard key="modules" title="Platform Modules" value="15" icon={Layers} accent="#06B6D4" sub="All modules active" />
      </div>

      {/* ══ MAP + S-CURVE (2 col) ══════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '20px', marginBottom: '20px' }}>

        {/* ORR Deployment Map */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px', padding: '22px',
          height: '460px', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <SectionHeader
            icon={MapIcon} iconColor="#10B981"
            title="ORR Live Deployment Map"
            action={
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, color: '#10B981',
                background: '#10B98115', border: '1px solid #10B98130',
                padding: '4px 10px', borderRadius: '99px',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', animation: 'pulse-amber 2s infinite' }} />
                LIVE · ESRI Satellite
              </span>
            }
          />
          <div style={{ flex: 1, position: 'relative', minHeight: 0, borderRadius: '12px', overflow: 'hidden' }}>
            <GoogleORRMap />
          </div>
        </div>

        {/* S-Curve */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px', padding: '22px',
          height: '460px', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-sm)',
        }}>
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
          {!stats?.milestones?.length && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px', fontStyle: 'italic' }}>
              💡 Add milestones to see real project S-curve data
            </p>
          )}
        </div>
      </div>

      {/* ══ BOTTOM ROW: PO Pie + Activity Feed ═══════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', marginBottom: '20px' }}>

        {/* PO Distribution */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '20px', padding: '22px', boxShadow: 'var(--shadow-sm)',
        }}>
          <SectionHeader icon={ShoppingCart} iconColor="#8B5CF6" title="PO Status Mix" />
          {pieData.length > 0 ? (
            <>
              <div style={{ height: '190px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={80} innerRadius={50} paddingAngle={3} strokeWidth={0}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px', fontSize: '0.78rem' }}
                      formatter={(v, name) => [v, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Custom legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                {pieData.map(d => {
                  const color = STATUS_COLORS[d.name] || '#94a3b8';
                  const total = pieData.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                  return (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1 }}>{d.name}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{d.value}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
              <ShoppingCart size={32} style={{ opacity: 0.15 }} />
              <p style={{ fontSize: '0.82rem' }}>No PO data yet</p>
            </div>
          )}
        </div>

        {/* Live Activity Feed */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '20px', padding: '22px', boxShadow: 'var(--shadow-sm)',
          display: 'flex', flexDirection: 'column',
        }}>
          <SectionHeader
            icon={Activity} iconColor="#EC4899"
            title="Recent Activity"
            action={
              <Link to="/activity" style={{
                fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-amber)',
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                View all <ChevronRight size={13} />
              </Link>
            }
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {stats?.recentActivities?.length > 0 ? (
              stats.recentActivities.map((a, i) => (
                <FeedItem key={a.id} activity={a} isLast={i === stats.recentActivities.length - 1} />
              ))
            ) : (
              <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px' }}>
                <Clock size={32} style={{ opacity: 0.15 }} />
                <p style={{ fontSize: '0.82rem' }}>No activity yet — start by creating a PO or GRN</p>
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
