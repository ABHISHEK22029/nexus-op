import React from 'react';

/* The Maks Ops mark — the same "MO" drawing as the browser tab's icon
   (public/favicon.svg), so the film and the tab agree. */
export const MoMark = ({ size = 64 }) => (
  <svg className="fm-mo" viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Maks Ops">
    <defs>
      <linearGradient id="fm-mo-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FF8214" />
        <stop offset="1" stopColor="#F2590D" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="15" fill="url(#fm-mo-g)" />
    <g fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round">
      <path d="M9 47V20l9 16 9-16v27" />
      <ellipse cx="46.5" cy="32" rx="8.5" ry="12" />
    </g>
  </svg>
);
