import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Activity, Search, Filter, Download, Clock, RefreshCw } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const TYPE_CONFIG = {
  PO_CREATED:        { color: '#F59E0B', icon: '📦', label: 'PO Created',        bg: 'rgba(245,158,11,0.12)'  },
  PO_APPROVED:       { color: '#3B82F6', icon: '✅', label: 'PO Approved',       bg: 'rgba(59,130,246,0.12)'  },
  PO_DISPATCHED:     { color: '#8B5CF6', icon: '🚚', label: 'Dispatched',        bg: 'rgba(139,92,246,0.12)'  },
  GRN_RECEIVED:      { color: '#10B981', icon: '📬', label: 'GRN Received',      bg: 'rgba(16,185,129,0.12)'  },
  BILL_GENERATED:    { color: '#EF4444', icon: '📄', label: 'Bill Generated',    bg: 'rgba(239,68,68,0.12)'   },
  BILL_SUBMITTED:    { color: '#F43F5E', icon: '📨', label: 'Bill Submitted',    bg: 'rgba(244,63,94,0.12)'   },
  BILL_APPROVED:     { color: '#22C55E', icon: '💚', label: 'Bill Approved',     bg: 'rgba(34,197,94,0.12)'   },
  BILL_PAID:         { color: '#22C55E', icon: '💰', label: 'Payment Released',  bg: 'rgba(34,197,94,0.12)'   },
  INDENT_CREATED:    { color: '#F97316', icon: '📋', label: 'Indent Created',    bg: 'rgba(249,115,22,0.12)'  },
  INDENT_UPDATED:    { color: '#EC4899', icon: '🔄', label: 'Indent Updated',    bg: 'rgba(236,72,153,0.12)'  },
  MB_ENTRY:          { color: '#06B6D4', icon: '📐', label: 'MB Entry',          bg: 'rgba(6,182,212,0.12)'   },
  MILESTONE_UPDATED: { color: '#A78BFA', icon: '🎯', label: 'Milestone Update',  bg: 'rgba(167,139,250,0.12)' },
  VENDOR_ADDED:      { color: '#84CC16', icon: '🏢', label: 'Vendor Added',      bg: 'rgba(132,204,22,0.12)'  },
};

const ALL_TYPES = ['ALL', ...Object.keys(TYPE_CONFIG)];

const timeAgo = (ts) => {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
};

const fullTime = (ts) => new Date(ts).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true
});

const ActivityLog = () => {
  const { activeProject } = useProject();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeProject
        ? `${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/activities?projectId=${activeProject.id}`
        : '${import.meta.env.VITE_API_URL || "http://localhost:8080/api"}/activities';
      const res = await axios.get(url);
      setActivities(res.data || []);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const filtered = activities.filter(a => {
    const matchType = typeFilter === 'ALL' || a.type === typeFilter;
    const matchSearch = !search || a.description?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const exportCSV = () => {
    const rows = ['ID,Type,Description,Timestamp'];
    filtered.forEach(a => rows.push(`${a.id},"${a.type}","${a.description}","${a.timestamp}"`));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nexus_activity_log.csv'; a.click();
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', animation: 'fade-in 0.4s ease' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={22} style={{ color: 'var(--brand-amber)' }} />
            Activity Timeline
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
            Immutable audit log of all platform actions — {activities.length} total events recorded
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchActivities} style={{
            padding: '8px 14px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)', borderRadius: '8px',
            color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '0.78rem', fontFamily: 'var(--font-body)',
          }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={exportCSV} style={{
            padding: '8px 14px', background: 'rgba(255,122,0,0.1)',
            border: '1px solid rgba(255,122,0,0.25)', borderRadius: '8px',
            color: 'var(--brand-amber)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '0.78rem', fontFamily: 'var(--font-body)', fontWeight: 600,
          }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap',
        padding: '16px', background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)', borderRadius: '12px',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text" placeholder="Search activity…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px',
              background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)',
              borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.82rem',
              fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select
            value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{
              padding: '8px 12px', background: 'var(--bg-deep)',
              border: '1px solid var(--border-subtle)', borderRadius: '8px',
              color: 'var(--text-primary)', fontSize: '0.82rem',
              fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer',
            }}
          >
            {ALL_TYPES.map(t => (
              <option key={t} value={t}>
                {t === 'ALL' ? 'All Types' : (TYPE_CONFIG[t]?.label || t)}
              </option>
            ))}
          </select>
        </div>

        {/* Active filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {typeFilter !== 'ALL' && (
            <span
              onClick={() => setTypeFilter('ALL')}
              style={{
                padding: '4px 10px', background: `${TYPE_CONFIG[typeFilter]?.color}18`,
                border: `1px solid ${TYPE_CONFIG[typeFilter]?.color}30`,
                color: TYPE_CONFIG[typeFilter]?.color,
                borderRadius: '99px', fontSize: '0.7rem', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              {TYPE_CONFIG[typeFilter]?.icon} {TYPE_CONFIG[typeFilter]?.label} ✕
            </span>
          )}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
            Loading activity log…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <Activity size={40} style={{ color: 'var(--text-muted)', opacity: 0.2, display: 'block', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>No activity found</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>
              {search || typeFilter !== 'ALL' ? 'Try clearing your filters' : 'Start creating POs, GRNs, and Bills to see events here'}
            </p>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Timeline vertical line */}
            <div style={{
              position: 'absolute', left: '55px', top: 0, bottom: 0,
              width: '1px', background: 'var(--border-subtle)',
            }} />

            {filtered.map((activity, idx) => {
              const cfg = TYPE_CONFIG[activity.type] || { color: '#94a3b8', icon: '🔔', label: activity.type, bg: 'rgba(148,163,184,0.12)' };
              return (
                <div
                  key={activity.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '16px',
                    padding: '16px 20px',
                    borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    transition: 'background 200ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Icon */}
                  <div style={{
                    flexShrink: 0,
                    width: '34px', height: '34px',
                    background: cfg.bg,
                    border: `1px solid ${cfg.color}35`,
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem',
                    position: 'relative', zIndex: 1,
                    marginLeft: '22px',
                  }}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                        {activity.description}
                      </p>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {timeAgo(activity.timestamp)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.6, marginTop: '2px' }}>
                          {fullTime(activity.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        fontSize: '0.65rem', fontWeight: 700,
                        color: cfg.color,
                        background: cfg.bg,
                        padding: '2px 8px',
                        borderRadius: '99px',
                        border: `1px solid ${cfg.color}30`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                      }}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
