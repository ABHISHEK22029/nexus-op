import { ChevronDown } from 'lucide-react';

/* A status that can be changed in a table row, drawn as the coloured pill a
   status is everywhere else, not a grey form box in the middle of the row.
   The pill shows the current status at its own width; the real select lies
   over it, invisible, so a click, a tap or the keyboard opens the usual
   menu. Styling in index.css (.status-pill); the colour comes in as --pill. */
export default function StatusSelect({ value, options, onChange, color, label }) {
  return (
    <span className="status-pill" style={{ '--pill': color || '#64748b' }}>
      {value}<ChevronDown size={12} aria-hidden="true" />
      <select value={value} aria-label={label} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </span>
  );
}
