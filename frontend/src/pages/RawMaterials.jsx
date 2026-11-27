import React, { useState } from 'react';
import { Boxes, FileSpreadsheet } from 'lucide-react';
import MasterList from '../components/MasterList';
import ItemImport from '../components/ItemImport';
import { fmtINR } from '../lib/format';

export default function RawMaterials() {
  const [importing, setImporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <>
      <MasterList
        title="Raw Materials"
        subtitle="The inputs you buy to build your SKUs."
        endpoint="raw-materials"
        attachEntity="raw_material"
        icon={Boxes}
        reloadKey={reloadKey}
        actions={
          <button type="button" onClick={() => setImporting(true)} className="btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            title="Add or update raw materials from an Excel or CSV sheet" data-import-open="materials">
            <FileSpreadsheet size={15} /> Import
          </button>
        }
        fields={[
          { key: 'material_code', label: 'Material Code', placeholder: 'MSA-50' },
          { key: 'name', label: 'Name', required: true, placeholder: 'MS Angle 50x50x6' },
          { key: 'grade', label: 'Grade', placeholder: 'IS 2062' },
          { key: 'unit', label: 'Unit', type: 'select', options: ['kg', 'nos', 'm', 'mt', 'sqm', 'sheet', 'set', 'ltr'] },
          { key: 'standard_rate', label: 'Standard Rate (₹)', type: 'number', placeholder: '62' },
          { key: 'hsn', label: 'HSN', placeholder: '7216', digits: true, maxLength: 8 },
        ]}
        columns={[
          { key: 'material_code', label: 'Code' },
          { key: 'name', label: 'Material' },
          { key: 'grade', label: 'Grade' },
          { key: 'unit', label: 'Unit' },
          { key: 'standard_rate', label: 'Rate', render: r => (r.standard_rate != null ? `${fmtINR(r.standard_rate)}` : '—') },
        ]}
      />
      {importing && (
        <ItemImport kind="materials" onClose={() => setImporting(false)} onDone={() => setReloadKey(k => k + 1)} />
      )}
    </>
  );
}
