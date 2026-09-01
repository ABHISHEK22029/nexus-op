/* ══════════════════════════════════════════════════════════
   Items — products and raw materials, one screen.

   Two sidebar entries before this: "SKUs" and "Raw Materials". Both answer
   "what do we deal in", and a fabricator's answer is naturally both halves
   at once — a cross-arm is a product, the plate it is cut from is a raw
   material, and the BOM connects them. Splitting the catalogue in the menu
   meant checking two places to find out whether something already exists.

   Both tabs keep their own pages underneath; this only puts them behind one
   door. The routes /skus and /raw-materials still work, so nothing that
   linked to them breaks.
   ══════════════════════════════════════════════════════════ */
import React from 'react';
import { Tags, Boxes, Package } from 'lucide-react';
import PageTabs, { useActiveTab } from '../components/PageTabs';
import SKUs from './SKUs';
import RawMaterials from './RawMaterials';

const TABS = [
  { key: 'products', label: 'Products', icon: <Tags size={14} /> },
  { key: 'materials', label: 'Raw materials', icon: <Boxes size={14} /> },
];

export default function Items() {
  const [tab, setTab] = useActiveTab(TABS, 'products');

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <Package size={24} style={{ color: 'var(--brand-amber)' }} /> Items
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Everything you make and everything you buy to make it.
        </p>
      </header>

      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {/* Each tab is the existing page, unchanged — this consolidates the
          navigation, not the screens themselves. */}
      {tab === 'products' ? <SKUs /> : <RawMaterials />}
    </div>
  );
}
