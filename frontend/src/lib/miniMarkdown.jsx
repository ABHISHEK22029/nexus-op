import React from 'react';

/* Dependency-free markdown → React.
   Supports: # / ## / ### headings, **bold**, *italic*, `code`,
   [links](url), bullet + numbered lists, and paragraphs.
   Returns { blocks, headings } — headings power an "On this page" TOC. */

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(text, keyBase) {
  // Split on bold / italic / code / links, keep delimiters.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const parts = String(text).split(re).filter((p) => p !== '' && p != null);
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={key}>{p.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(p)) return <code key={key} style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em', fontFamily: 'var(--font-mono)' }}>{p.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-amber)', textDecoration: 'none', fontWeight: 600 }}>{link[1]}</a>;
    return <React.Fragment key={key}>{p}</React.Fragment>;
  });
}

export function parseMarkdown(md) {
  const lines = String(md || '').split('\n');
  const blocks = [];
  const headings = [];
  let list = null;
  const flush = () => { if (list) { blocks.push({ type: 'list', ...list }); list = null; } };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)/.exec(line);
    const num = /^\s*\d+\.\s+(.*)/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const text = h[2];
      const id = slugify(text);
      if (level <= 2) headings.push({ id, text });
      blocks.push({ type: 'h', level, text, id });
    } else if (bullet) {
      if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
    } else if (num) {
      if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; }
      list.items.push(num[1]);
    } else {
      flush();
      if (line.trim()) blocks.push({ type: 'p', text: line });
    }
  });
  flush();
  return { blocks, headings };
}

export function Markdown({ children, compact }) {
  const { blocks } = parseMarkdown(children);
  const gap = compact ? 4 : 6;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const size = b.level === 1 ? '1.35rem' : b.level === 2 ? '1.08rem' : '0.95rem';
          return (
            <h3 key={i} id={b.id} style={{ scrollMarginTop: 90, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size, color: 'var(--text-primary)', margin: b.level === 2 ? '14px 0 2px' : '8px 0 0' }}>
              {b.text}
            </h3>
          );
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag key={i} style={{ margin: '2px 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-secondary)' }}>
              {b.items.map((it, j) => <li key={j} style={{ lineHeight: 1.6 }}>{inline(it, `${i}-${j}`)}</li>)}
            </Tag>
          );
        }
        return <p key={i} style={{ margin: 0, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{inline(b.text, i)}</p>;
      })}
    </div>
  );
}

export { slugify };
