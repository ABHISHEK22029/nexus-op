import React from 'react';

/* ══════════════════════════════════════════════════════════════════════
   Drawn things the ad shows: the bracket the story sells, and the three
   kinds of file vendors send their quotes in. SVG, so they stay sharp at
   any scale the stage is drawn at.
   ══════════════════════════════════════════════════════════════════════ */

/** The SS304 mounting bracket: a brushed stainless L with two holes. */
export const Bracket = ({ size = 160 }) => (
  <svg viewBox="0 0 160 120" width={size} height={size * 0.75} aria-hidden="true">
    <defs>
      <linearGradient id="adSteelA" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f4f6f9" />
        <stop offset="0.45" stopColor="#c9cfd8" />
        <stop offset="1" stopColor="#9aa3b1" />
      </linearGradient>
      <linearGradient id="adSteelB" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dfe3ea" />
        <stop offset="1" stopColor="#a8b0bd" />
      </linearGradient>
    </defs>
    <ellipse cx="82" cy="108" rx="62" ry="7" fill="#0f172a" opacity="0.12" />
    {/* the upright */}
    <path d="M30 14 L52 6 L52 82 L30 92 Z" fill="url(#adSteelA)" stroke="#8b94a3" strokeWidth="1" />
    <path d="M52 6 L58 9 L58 84 L52 82 Z" fill="#b8bfca" />
    {/* the base */}
    <path d="M30 92 L52 82 L136 92 L114 104 Z" fill="url(#adSteelB)" stroke="#8b94a3" strokeWidth="1" />
    <path d="M114 104 L136 92 L136 97 L114 109 Z" fill="#9aa3b1" />
    <path d="M30 92 L114 104 L114 109 L30 97 Z" fill="#b3bac6" />
    {/* the holes */}
    <ellipse cx="41" cy="40" rx="4.5" ry="5.5" fill="#56606f" />
    <ellipse cx="88" cy="95" rx="7" ry="3" fill="#56606f" />
    <ellipse cx="106" cy="97.5" rx="5" ry="2.2" fill="#56606f" />
    {/* the brushed sheen */}
    <path d="M33 20 L49 14 L49 30 L33 37 Z" fill="#fff" opacity="0.35" />
  </svg>
);

const FILE_TONES = { xlsx: '#16a34a', pdf: '#dc2626', docx: '#2563eb' };

/** A file as a document icon with its kind on a band: XLSX, PDF, DOCX. */
export const FileIcon = ({ kind = 'pdf', size = 64 }) => (
  <svg viewBox="0 0 48 60" width={size} height={size * 1.25} aria-hidden="true">
    <path d="M4 2 H32 L44 14 V56 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 Z" fill="#fff" stroke="#cbd5e1" strokeWidth="1.5" />
    <path d="M32 2 V14 H44" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
    <rect x="0" y="32" width="36" height="14" rx="3" fill={FILE_TONES[kind]} />
    <text x="18" y="42.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">{kind.toUpperCase()}</text>
    <rect x="10" y="50" width="26" height="2.5" rx="1" fill="#e2e8f0" />
    <rect x="10" y="20" width="16" height="2.5" rx="1" fill="#e2e8f0" />
    <rect x="10" y="25" width="22" height="2.5" rx="1" fill="#e2e8f0" />
  </svg>
);
