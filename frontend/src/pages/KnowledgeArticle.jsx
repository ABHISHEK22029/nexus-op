import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Sparkles, Link2, Printer, Building2, Hash, BookOpen } from 'lucide-react';
import { Markdown, parseMarkdown } from '../lib/miniMarkdown';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const CAT_COLOR = { Overview: '#0ea5e9', Sales: '#3b82f6', Catalog: '#8b5cf6', Procurement: '#f59e0b', Production: '#a855f7', Billing: '#10b981', Setup: '#64748b' };
const catColor = (c) => CAT_COLOR[c] || '#64748b';
const RECENT_KEY = 'nexus.kb.recent';

export default function KnowledgeArticle() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [article, setArticle] = useState(null);
  const [nav, setNav] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [openGroups, setOpenGroups] = useState({});

  useEffect(() => {
    setLoading(true); setErr(false);
    fetch(`${API}/kb/articles/${slug}`).then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(a => {
        setArticle(a);
        setOpenGroups(g => ({ ...g, [a.category]: true }));
        try {
          const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(s => s !== slug);
          localStorage.setItem(RECENT_KEY, JSON.stringify([slug, ...prev].slice(0, 12)));
        } catch { /* ignore */ }
      })
      .catch(() => setErr(true)).finally(() => setLoading(false));
    fetch(`${API}/kb/articles`).then(r => r.ok ? r.json() : { articles: [] }).then(d => setNav(d.articles || [])).catch(() => {});
    window.scrollTo?.(0, 0);
  }, [slug]);

  const groups = useMemo(() => {
    const m = new Map();
    nav.forEach(a => { const c = a.category || 'Other'; if (!m.has(c)) m.set(c, []); m.get(c).push(a); });
    return [...m.entries()];
  }, [nav]);

  const headings = useMemo(() => (article ? parseMarkdown(article.body).headings : []), [article]);

  const askFollowUp = () => {
    if (!article) return;
    window.dispatchEvent(new CustomEvent('askai:open', { detail: { seed: `About the "${article.title}" guide — ` } }));
  };
  const copyLink = () => { navigator.clipboard?.writeText(window.location.href); toast.success('Link copied'); };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const railCard = { ...card, padding: 14 };
  const railLabel = { fontSize: '0.66rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 };
  const actionBtn = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 };

  if (loading) return <div style={{ maxWidth: 1200, margin: '0 auto', padding: 48, color: 'var(--text-muted)' }}>Loading…</div>;
  if (err || !article) return (
    <div style={{ maxWidth: 700, margin: '40px auto', textAlign: 'center', color: 'var(--text-muted)' }}>
      <BookOpen size={40} style={{ opacity: 0.35, marginBottom: 12 }} />
      <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Article not found</div>
      <button onClick={() => navigate('/knowledge')} className="btn-secondary" style={{ marginTop: 16 }}>Back to Smart Knowledge</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '230px minmax(0,1fr) 250px', gap: 24, alignItems: 'start' }}>
      {/* Left rail — grouped nav */}
      <aside style={{ position: 'sticky', top: 20 }}>
        <button onClick={() => navigate('/knowledge')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem', marginBottom: 14, padding: 0 }}>
          <ArrowLeft size={15} /> Smart Knowledge
        </button>
        <div style={{ maxHeight: 'calc(100vh - 130px)', overflowY: 'auto', paddingRight: 4 }}>
          {groups.map(([cat, items]) => {
            const open = openGroups[cat];
            return (
              <div key={cat} style={{ marginBottom: 6 }}>
                <button onClick={() => setOpenGroups(g => ({ ...g, [cat]: !g[cat] }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  {cat} <ChevronDown size={13} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }} />
                </button>
                {open && items.map(it => {
                  const active = it.slug === slug;
                  return (
                    <button key={it.slug} onClick={() => navigate(`/knowledge/${it.slug}`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1.35, marginBottom: 1,
                      background: active ? 'hsl(28,100%,54%,0.1)' : 'transparent', color: active ? 'var(--brand-amber)' : 'var(--text-secondary)', fontWeight: active ? 700 : 500, borderLeft: active ? '2px solid var(--brand-amber)' : '2px solid transparent' }}>
                      {it.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Center — content */}
      <article style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          <span onClick={() => navigate('/knowledge')} style={{ cursor: 'pointer' }}>Smart Knowledge</span>
          <span>›</span>
          <span style={{ color: catColor(article.category), fontWeight: 600 }}>{article.category}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: '0.66rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: catColor(article.category), background: catColor(article.category) + '1f' }}>{article.article_type || 'Guide'}</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px', lineHeight: 1.15 }}>{article.title}</h1>
        {article.summary && <p style={{ fontSize: '1.02rem', color: 'var(--text-secondary)', margin: '0 0 22px', lineHeight: 1.6 }}>{article.summary}</p>}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 0 22px' }} />
        <div style={{ fontSize: '0.92rem' }}><Markdown>{article.body}</Markdown></div>

        <div style={{ marginTop: 32, padding: 18, ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, background: 'linear-gradient(135deg, hsl(28,100%,54%,0.06), transparent)' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Still stuck?</div>
            <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>Ask AI about this guide or your own data.</div>
          </div>
          <button onClick={askFollowUp} className="btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Sparkles size={15} /> Ask AI a follow-up</button>
        </div>
      </article>

      {/* Right rail */}
      <aside style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {headings.length > 0 && (
          <div style={railCard}>
            <div style={railLabel}>On this page</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {headings.map(h => (
                <a key={h.id} href={`#${h.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' }); }}
                  style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textDecoration: 'none', padding: '3px 0', cursor: 'pointer' }}>{h.text}</a>
              ))}
            </div>
          </div>
        )}
        <div style={railCard}>
          <div style={railLabel}>Actions</div>
          <button style={actionBtn} onClick={copyLink}><Link2 size={15} /> Copy link</button>
          <button style={{ ...actionBtn, marginBottom: 0 }} onClick={() => window.print()}><Printer size={15} /> Print</button>
        </div>
        <div style={railCard}>
          <div style={railLabel}>Department</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.9rem' }}>
            <Building2 size={15} style={{ color: catColor(article.category) }} /> {article.category}
          </div>
        </div>
        <div style={railCard}>
          <div style={railLabel}>Reference</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
            <Hash size={14} /> {article.slug.toUpperCase()}
          </div>
        </div>
        <button onClick={askFollowUp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: '0.86rem', background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))' }}>
          <Sparkles size={16} /> Ask AI a follow-up
        </button>
      </aside>
    </div>
  );
}
