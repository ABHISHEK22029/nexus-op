import React from 'react';
import { UNIT_GROUPS, knownUnit } from '../lib/units';

/* A unit of measure, picked from the list rather than typed.

   The field used to be a text box that looked like a hint ("nos") but was a
   real value, with a spell-check squiggle under it, and that accepted any
   text at all. Now it is a choice. A unit stored on an older document that
   is not in the list stays selectable, marked as such, so nothing changes
   until somebody picks a proper one. */
export default function UnitSelect({ value, onChange, style, className, ariaLabel = 'Unit', disabled }) {
  const known = knownUnit(value);
  const legacy = value && !known ? String(value) : null;
  return (
    <select
      style={style}
      className={className}
      value={known || legacy || 'nos'}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {legacy && <option value={legacy}>{legacy} (not a standard unit)</option>}
      {UNIT_GROUPS.map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
