/* ══════════════════════════════════════════════════════════
   inputGuards.js — number fields take numbers.

   Two things a tester hit on every screen with a number in it:
   · Chrome lets a number field take "e", "+" and "-" (it allows
     scientific notation), so "1e9" and "--5" could be typed into a
     quantity or a rate;
   · the mouse wheel changes a focused number field as the page scrolls
     past it, silently altering an amount someone typed a moment ago.

   Installed once for every <input type="number"> in the app (main.jsx),
   instead of on each of the hundreds of fields one at a time. A field that
   may go below zero (min below 0, or no min at all — a round-off) keeps
   its minus sign.
   ══════════════════════════════════════════════════════════ */
const isNumber = (el) => el && el.tagName === 'INPUT' && el.type === 'number';

document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (!isNumber(el) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'e' || e.key === 'E' || e.key === '+') { e.preventDefault(); return; }
  if (e.key === '-') {
    const min = el.getAttribute('min');
    if (min != null && min !== '' && Number(min) >= 0) e.preventDefault();
  }
}, true);

/* paste: keep only what a number can be */
document.addEventListener('paste', (e) => {
  const el = e.target;
  if (!isNumber(el)) return;
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  const clean = text.replace(/[,\s₹]/g, '');
  if (!/^-?\d*\.?\d*$/.test(clean) || clean === '') e.preventDefault();
}, true);

/* the wheel scrolls the page; it does not change the number */
document.addEventListener('wheel', (e) => {
  const el = document.activeElement;
  if (isNumber(el) && el === e.target) el.blur();
}, { passive: true });
