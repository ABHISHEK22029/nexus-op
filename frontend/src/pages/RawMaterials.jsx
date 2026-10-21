import React from 'react';
import { Boxes } from 'lucide-react';
import MasterList from '../components/MasterList';
import { fmtINR } from '../lib/format';

export default function RawMaterials() {
  return (
    <MasterList
      title="Raw Materials"
      subtitle="The inputs you buy to build your SKUs."
      endpoint="raw-materials"
      attachEntity="raw_material"
      icon={Boxes}
      fields={[
        { key: 'material_code', label: 'Material Code', placeholder: 'MSA-50' },
        { key: 'name', label: 'Name', required: true, placeholder: 'MS Angle 50x50x6' },
        { key: 'grade', label: 'Grade', placeholder: 'IS 2062' },
        { key: 'unit', label: 'Unit', type: 'select', options: ['kg', 'nos', 'mtr', 'ton', 'sqm'] },
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
  );
}
