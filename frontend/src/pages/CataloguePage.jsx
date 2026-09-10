/* ══════════════════════════════════════════════════════════
   Catalogue — a screen of its own in the menu.

   It started as a Configurator tile, which was wrong. A setting is
   something you decide once; a catalogue is something a business works on
   — choosing what to list, writing the copy for each item, watching what
   comes back. That belongs beside Enquiries in Sales, not three clicks
   into Configure.

   The Configurator tile still exists and shows the same settings, because
   somebody looking for "where do I turn this on" will look there.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { Store } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';
import CatalogueSettings from '../components/CatalogueSettings';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CataloguePage() {
  const toast = useToast();

  /* The same shape CatalogueSettings gets from the Configurator, so one
     component serves both places rather than two drifting copies. */
  const api = async (path, opts = {}) => {
    const token = getToken();
    const r = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || d.error || 'Something went wrong');
    return d;
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <Store size={23} style={{ color: 'var(--brand-amber)' }} /> Catalogue
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          A public page of what you sell, at a link you can share. Anyone who opens it can
          send you an enquiry, and it arrives in <strong>Sales → Enquiries</strong>.
        </p>
      </div>
      <CatalogueSettings api={api} toast={toast} />
    </div>
  );
}
