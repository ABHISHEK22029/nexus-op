import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Search, Sparkles, Grid2x2, LayoutList, Rows3, ChevronDown,
  TrendingUp, Clock, ExternalLink, Filter, X, Check,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Category → accent colour (mirrors the reference's coloured badges).
const CAT_COLOR = {
  Overview: '#0ea5e9', Sales: '#3b82f6', Catalog: '#8b5cf6', Procurement: '#f59e0b',
  Production: '#a855f7', Billing: '#10b981', Setup: '#64748b',
};
const catColor = (c) => CAT_COLOR[c] || '#64748b';
const RECENT_KEY = 'nexus.kb.recent';
const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };

export default function SmartKnowledge() {
  const navigate = useNavigate();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('keyword');       // keyword | ai
  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [deptSel, setDeptSel] = useState(new Set());
  const [deptOpen, setDeptOpen] = useState(false);
  const [collection, setCollection] = useState(null); // trending | recent
  const [view, setView] = useState('list');
  const searchRef = useRef(null);
  const ddRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/kb/articles`).then(r => r.ok ? r.json() : { articles: [] })
      .then(d => setAll(d.articles || [])).catch(() => setAll([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const onDoc = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setDeptOpen(false); };
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const departments = useMemo(() => {
    const m = new Map();
    all.forEach(a => a.category && m.set(a.category, (m.get(a.category) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const runAiSearch = () => {
    const q = query.trim(); if (!q) return;
    setAiLoading(true);
    fetch(`${API}/kb/articles?q=${encodeURIComponent(q)}`).then(r => r.ok ? r.json() : { articles: [] })
      .then(d => setAiResults(d.articles || [])).catch(() => setAiResults([])).finally(() => setAiLoading(false));
  };

  const byId = useMemo(() => new Map(all.map(a => [a.slug, a])), [all]);
  const results = useMemo(() => {
    let base;
    if (collection === 'trending') base = [...all].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 20);
    else if (collection === 'recent') base = loadRecent().map(s => byId.get(s)).filter(Boolean);
    else if (mode === 'ai' && aiResults) base = aiResults;
    else if (query.trim()) {
      const q = query.toLowerCase();
      base = all.filter(a => a.title.toLowerCase().includes(q) || a.summary?.toLowerCase().includes(q) || (a.keywords || '').toLowerCase().includes(q));
    } else base = all;
    if (deptSel.size) base = base.filter(a => a.category && deptSel.has(a.category));
    return base;
  }, [all, byId, collection, mode, aiResults, query, deptSel]);

  const open = (slug) => navigate(`/knowledge/${slug}`);
  const toggleDept = (d) => setDeptSel(s => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const aiActive = mode === 'ai' && !!query.trim();

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const pill = (active) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
    border: '1px solid ' + (active ? 'var(--brand-amber)' : 'var(--border-default)'), background: active ? 'hsl(28,100%,54%,0.1)' : 'var(--bg-surface)', color: active ? 'var(--brand-amber)' : 'var(--text-secondary)' });
  const Badge = ({ cat }) => (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 6, fontSize: '0.66rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase',
      color: catColor(cat), background: catColor(cat) + '1f' }}>{cat || 'Guide'}</span>
  );

  return (
    <div style={{ maxWidth: 1160, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <BookOpen size={24} style={{ color: 'var(--brand-amber)' }} /> Smart Knowledge
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 4 }}>Guides and how-tos for every part of Nexus-OP. Stuck? Hit <b>Ask AI</b> anytime.</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div ref={ddRef} style={{ position: 'relative' }}>
          <button onClick={() => setDeptOpen(o => !o)} style={pill(deptSel.size > 0)}>
            <Filter size={14} /> Department {deptSel.size > 0 && <span style={{ background: 'var(--brand-amber)', color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: '0.68rem' }}>{deptSel.size}</span>}
            <ChevronDown size={13} />
          </button>
          {deptOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, width: 230, ...card, boxShadow: 'var(--shadow-md)', padding: 6 }}>
              {departments.map(([d, n]) => (
                <button key={d} onClick={() => toggleDept(d)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.83rem' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: deptSel.has(d) ? 'var(--brand-amber)' : 'transparent' }}>
                    {deptSel.has(d) && <Check size={11} color="#fff" />}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{d}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 4px 12px', borderRadius: 999, ...card, borderColor: aiActive ? 'var(--brand-amber)' : 'var(--border-subtle)' }}>
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input ref={searchRef} value={query} onChange={e => { setQuery(e.target.value); if (mode === 'ai') setAiResults(null); }}
            onKeyDown={e => { if (e.key === 'Enter' && mode === 'ai') runAiSearch(); }}
            placeholder="Search guides and answers…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.86rem' }} />
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 999, padding: 2 }}>
            <button onClick={() => setMode('keyword')} style={{ padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, background: mode === 'keyword' ? 'var(--bg-surface)' : 'transparent', color: mode === 'keyword' ? 'var(--text-primary)' : 'var(--text-muted)' }}>Keyword</button>
            <button onClick={() => setMode('ai')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, background: mode === 'ai' ? 'var(--brand-amber)' : 'transparent', color: mode === 'ai' ? '#fff' : 'var(--text-muted)' }}><Sparkles size={12} /> AI</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, ...card, padding: 4 }}>
          {[['grid', Grid2x2], ['list', LayoutList], ['compact', Rows3]].map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)} aria-label={v} style={{ width: 34, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', cursor: 'pointer', background: view === v ? 'hsl(28,100%,54%,0.12)' : 'transparent', color: view === v ? 'var(--brand-amber)' : 'var(--text-muted)' }}><Icon size={16} /></button>
          ))}
        </div>
      </div>

      {aiActive && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 12px' }}>
          <Sparkles size={13} style={{ color: 'var(--brand-amber)' }} />
          {aiLoading ? 'Searching…' : aiResults ? `Smart results for “${query.trim()}”` : 'Press Enter to run a smart search.'}
        </p>
      )}

      {/* Collections */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setCollection(c => c === 'trending' ? null : 'trending')} style={pill(collection === 'trending')}><TrendingUp size={14} /> Trending</button>
        <button onClick={() => setCollection(c => c === 'recent' ? null : 'recent')} style={pill(collection === 'recent')}><Clock size={14} /> Recently viewed {loadRecent().length > 0 && <span style={{ background: 'var(--brand-amber)', color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: '0.68rem' }}>{loadRecent().length}</span>}</button>
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{loading ? '' : `${results.length} guide${results.length === 1 ? '' : 's'}`}</span>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : results.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>No guides match.</div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {results.map(a => (
            <button key={a.slug} onClick={() => open(a.slug)} style={{ ...card, textAlign: 'left', padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `3px solid ${catColor(a.category)}` }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'} onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
              <Badge cat={a.category} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{a.title}</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{a.summary}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto', paddingTop: 6 }}>
                {(a.tags || []).slice(0, 3).map(t => <span key={t} style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '2px 8px' }}>{t}</span>)}
              </div>
            </button>
          ))}
        </div>
      ) : view === 'compact' ? (
        <div style={{ ...card, overflow: 'hidden' }}>
          {results.map((a, i) => (
            <div key={a.slug} onClick={() => open(a.slug)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <Badge cat={a.category} />
              <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{a.title}</span>
              <ChevronDown size={15} style={{ transform: 'rotate(-90deg)', color: 'var(--text-muted)' }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {['#', 'Type', 'Title', 'Department', 'Open'].map(h => <th key={h} style={{ padding: '11px 16px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {results.map((a, i) => (
                <tr key={a.slug} onClick={() => open(a.slug)} style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem', width: 40 }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px' }}><Badge cat={a.category} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{a.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>{a.summary}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.84rem', fontWeight: 600, color: catColor(a.category) }}>{a.category || '—'}</td>
                  <td style={{ padding: '12px 16px', width: 60 }}><span style={{ color: 'var(--brand-amber)' }}><ExternalLink size={16} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
