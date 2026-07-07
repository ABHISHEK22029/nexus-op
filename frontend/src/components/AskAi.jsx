import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, Send, Bot } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PAGE_NAMES = {
  '/dashboard': 'Dashboard', '/customers': 'Customers', '/customer-orders': 'Customer Orders',
  '/sales-invoices': 'Sales Invoices', '/skus': 'SKUs', '/raw-materials': 'Raw Materials',
  '/vendors': 'Vendors', '/quotations': 'Quotations', '/purchase-orders': 'Purchase Orders',
  '/po': 'Purchase Orders', '/grn': 'GRN', '/inventory': 'Inventory', '/bills': 'RA Bills',
  '/expenses': 'Expenses', '/projects': 'Projects', '/production': 'Production',
  '/automation': 'Automation', '/reports': 'Reports', '/users': 'Team & Access',
};

const SUGGESTIONS = [
  "What's overdue right now?",
  'What needs my approval?',
  'How do I raise a vendor PO?',
  "What's low on stock?",
];

/* Tiny, dependency-free markdown → React (bold, bullet + numbered lists, paragraphs). */
function renderMarkdown(text) {
  const inline = (s, key) => {
    const parts = String(s).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return parts.map((p, i) =>
      /^\*\*[^*]+\*\*$/.test(p)
        ? <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
        : <React.Fragment key={`${key}-${i}`}>{p}</React.Fragment>
    );
  };
  const lines = String(text || '').split('\n');
  const blocks = [];
  let list = null; // { ordered, items: [] }
  const flush = () => { if (list) { blocks.push({ type: 'list', ...list }); list = null; } };
  lines.forEach((raw) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)/.exec(line);
    const num = /^\s*\d+\.\s+(.*)/.exec(line);
    if (bullet) { if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; } list.items.push(bullet[1]); }
    else if (num) { if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; } list.items.push(num[1]); }
    else { flush(); if (line.trim()) blocks.push({ type: 'p', text: line }); }
  });
  flush();
  return blocks.map((b, i) => {
    if (b.type === 'list') {
      const Tag = b.ordered ? 'ol' : 'ul';
      return <Tag key={i} style={{ margin: '4px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}
      </Tag>;
    }
    return <p key={i} style={{ margin: '4px 0' }}>{inline(b.text, i)}</p>;
  });
}

export default function AskAi() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role, content, sources?}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Don't show the assistant on marketing/auth pages.
  const hidden = ['/', '/login', '/signup', '/get-started', '/platform', '/how-it-works',
    '/onboarding', '/beta-welcome', '/beta-onboarding'].includes(location.pathname);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);

  // Let any screen open + seed the assistant (e.g. an article's "Ask AI a follow-up").
  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      const seed = e?.detail?.seed;
      if (seed) setInput(seed);
      setTimeout(() => { inputRef.current?.focus(); const el = inputRef.current; if (el) el.selectionStart = el.selectionEnd = el.value.length; }, 120);
    };
    window.addEventListener('askai:open', onOpen);
    return () => window.removeEventListener('askai:open', onOpen);
  }, []);

  if (hidden) return null;

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          context: PAGE_NAMES[location.pathname] || '',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Never surface internal/config details to end-users — show a friendly note.
        const friendly = res.status === 503
          ? "Ask AI isn't switched on yet — please check back shortly."
          : "I couldn't reach the assistant just now. Please try again in a moment.";
        setMessages([...next, { role: 'assistant', content: friendly, sources: [] }]);
        return;
      }
      setMessages([...next, { role: 'assistant', content: d.answer || '…', sources: d.sources || [] }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: "I couldn't reach the assistant just now. Please try again in a moment.", sources: [] }]);
    } finally { setLoading(false); }
  };

  const accent = 'var(--brand-amber)';
  const bubbleBase = { maxWidth: '85%', padding: '9px 12px', borderRadius: 12, fontSize: '0.86rem', lineHeight: 1.5, wordBreak: 'break-word' };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ask AI"
          style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 900, display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: '0.88rem',
            background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))', boxShadow: '0 8px 24px hsl(28,100%,54%,0.4)' }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.06)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}>
          <Sparkles size={17} /> Ask AI
        </button>
      )}

      {/* Panel */}
      {open && (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 900, width: 'min(400px, calc(100vw - 32px))',
          height: 'min(640px, calc(100vh - 44px))', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)',
            background: 'linear-gradient(135deg, hsl(28,100%,54%,0.10), transparent)' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))', flexShrink: 0 }}>
              <Sparkles size={16} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.94rem', lineHeight: 1.1 }}>Ask AI</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Answers about your Nexus-OP data</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
          </div>

          {/* Thread */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ margin: 'auto 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'hsl(28,100%,54%,0.12)' }}><Bot size={24} style={{ color: accent }} /></div>
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>How can I help?</div>
                <p style={{ fontSize: '0.8rem', margin: '0 0 16px', lineHeight: 1.5 }}>Ask about your orders, invoices, inventory, production — or how to use a feature.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-default)',
                      background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = accent)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-default)')}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 5 }}>
                <div style={{ ...bubbleBase,
                  background: m.role === 'user' ? 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))' : 'var(--bg-elevated)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                  borderBottomRightRadius: m.role === 'user' ? 3 : 12, borderBottomLeftRadius: m.role === 'user' ? 12 : 3 }}>
                  {m.role === 'user' ? m.content : <div>{renderMarkdown(m.content)}</div>}
                </div>
                {m.role === 'assistant' && m.sources?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 2 }}>
                    {m.sources.map(s => (
                      <span key={s.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600,
                        color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: '3px 9px' }}>
                        <Sparkles size={10} style={{ color: accent }} /> {s.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: 'flex-start', ...bubbleBase, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)',
                  animation: `askai-bounce 1s ${i * 0.15}s infinite ease-in-out` }} />)}
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea ref={inputRef} value={input} rows={1} placeholder="Ask about Nexus-OP…"
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              style={{ flex: 1, resize: 'none', maxHeight: 90, padding: '9px 11px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={() => send()} disabled={loading || !input.trim()} aria-label="Send"
              style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: 'none', cursor: loading || !input.trim() ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', opacity: loading || !input.trim() ? 0.5 : 1,
                background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))' }}><Send size={16} /></button>
          </div>
        </div>
      )}
      <style>{`@keyframes askai-bounce{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}`}</style>
    </>
  );
}
