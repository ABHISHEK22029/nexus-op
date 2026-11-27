import React, { useState } from 'react';
import { Tags, Layers, FileSpreadsheet } from 'lucide-react';
import MasterList from '../components/MasterList';
import BomModal from '../components/BomModal';
import ItemImport from '../components/ItemImport';
import { fmtINR } from '../lib/format';

const importBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };

export default function SKUs() {
  const [bomSku, setBomSku] = useState(null);
  /* 'products' | 'recipes' — the import window that is open, if any. */
  const [importing, setImporting] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <>
      <MasterList
        title="SKUs"
        subtitle="Your product / part catalog — what you quote and deliver. Set a recipe (BOM) to fabricate in-house."
        endpoint="skus"
        attachEntity="sku"
        icon={Tags}
        reloadKey={reloadKey}
        actions={<>
          <button type="button" onClick={() => setImporting('products')} className="btn-secondary btn-sm" style={importBtn}
            title="Add or update products from an Excel or CSV sheet" data-import-open="products">
            <FileSpreadsheet size={15} /> Import
          </button>
          <button type="button" onClick={() => setImporting('recipes')} className="btn-secondary btn-sm" style={importBtn}
            title="Set many products' recipes (bills of materials) from one sheet" data-import-open="recipes">
            <Layers size={15} /> Import recipes
          </button>
        </>}
        rowAction={{
          label: 'Recipe',
          title: 'Set the bill of materials for this product',
          icon: <Layers size={13} />,
          onClick: (row) => setBomSku(row),
        }}
        fields={[
          { key: 'sku_code', label: 'SKU Code', placeholder: 'CA-VT' },
          { key: 'name', label: 'Name', required: true, placeholder: 'V-Type Cross Arm' },
          { key: 'unit', label: 'Unit', type: 'select', options: ['nos', 'kg', 'set', 'mtr', 'units'] },
          { key: 'price', label: 'Price (₹)', type: 'number', placeholder: '850' },
          { key: 'hsn', label: 'HSN', placeholder: '7308', digits: true, maxLength: 8 },
          { key: 'description', label: 'Description', wide: true, placeholder: 'Optional details / specification' },
        ]}
        columns={[
          { key: 'sku_code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'unit', label: 'Unit' },
          { key: 'price', label: 'Price', render: r => (r.price != null ? `${fmtINR(r.price)}` : '—') },
          { key: 'hsn', label: 'HSN' },
        ]}
      />
      {bomSku && <BomModal sku={bomSku} onClose={() => setBomSku(null)} />}
      {importing && (
        <ItemImport kind={importing} onClose={() => setImporting(null)} onDone={() => setReloadKey(k => k + 1)} />
      )}
    </>
  );
}
