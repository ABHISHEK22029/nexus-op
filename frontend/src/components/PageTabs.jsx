/* ══════════════════════════════════════════════════════════
   PageTabs — for screens that absorbed a menu entry.

   The sidebar had "Vendors" and "Vendor Supplies" as separate destinations.
   They are the same subject: who we buy from, and what they sell us. Two
   menu entries meant answering "who supplies plate?" from a different
   screen than "who are our vendors?", with no way to see both at once.

   The tab lives in the URL (?tab=supplies) rather than in component state,
   so a tab can be linked to, bookmarked, and survives a refresh — and the
   browser Back button steps between tabs the way people expect it to.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { useSearchParams } from 'react-router-dom';

export function useActiveTab(tabs, defaultKey) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const valid = tabs.some(t => t.key === requested);
  const active = valid ? requested : (defaultKey || tabs[0]?.key);

  const setActive = (key) => {
    const next = new URLSearchParams(params);
    if (key === (defaultKey || tabs[0]?.key)) next.delete('tab');
    else next.set('tab', key);
    // replace, not push: flipping a tab is not a navigation event people
    // want to walk back through one at a time.
    setParams(next, { replace: true });
  };

  return [active, setActive];
}

export default function PageTabs({ tabs, active, onChange }) {
  return (
    <div className="page-tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`page-tab${active === t.key ? ' is-active' : ''}`}
        >
          {t.icon}
          {t.label}
          {t.count != null && <span className="page-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
