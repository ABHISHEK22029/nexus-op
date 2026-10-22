import React from 'react';
import useInView from '../../../hooks/useInView';
import {
  ParseLines, CompareBars, YieldRing, TaxSplit, DocMorph, StockLevel, SearchGrid, localKeyframes,
} from '../FeatureDiagrams';

/* ══════════════════════════════════════════════════════════════════════
   A diagram by name — the small animated pictures of how a feature works
   (FeatureDiagrams), for the pages' content (content.js names them, as
   plain strings). They are drawings of the mechanism, not frames of a
   film, so a page's film is never repeated under it.

   Each one loops only while it is on screen (useInView's `visible`), and
   settles in its finished state under reduced motion (motion.css).
   ══════════════════════════════════════════════════════════════════════ */

const DIAGRAMS = {
  parse: ParseLines,
  compare: CompareBars,
  yield: YieldRing,
  gst: TaxSplit,
  stock: StockLevel,
  search: SearchGrid,
  'qt-co': (p) => <DocMorph {...p} from="QT" to="CO" />,
  'grn-inv': (p) => <DocMorph {...p} from="GRN" to="INV" tone="var(--accent-blue)" />,
  'inv-paid': (p) => <DocMorph {...p} from="INV" to="PAID" tone="var(--accent-emerald)" />,
  'co-dc': (p) => <DocMorph {...p} from="CO" to="DC" tone="var(--accent-emerald)" />,
  gstin: (p) => <DocMorph {...p} from="GSTIN" to="OK" tone="var(--accent-emerald)" />,
  ai: (p) => <DocMorph {...p} from="?" to="₹" tone="var(--accent-blue)" />,
  boq: (p) => <DocMorph {...p} from="BOQ" to="RA" />,
  'doc-ai': (p) => <DocMorph {...p} from="DOC" to="AI" />,
};

export default function Diagram({ name, className = '' }) {
  const [ref, , visible] = useInView(0.18);
  const Picture = DIAGRAMS[name];
  return (
    <div ref={ref} className={`mp-diagram ${className}`} aria-hidden="true">
      {/* two of the diagrams' keyframes live beside them, not in motion.css;
          React hoists this once, however many diagrams are on the page */}
      <style href="mk-diagram-keyframes" precedence="default">{localKeyframes}</style>
      {Picture && <Picture on={visible} />}
    </div>
  );
}
