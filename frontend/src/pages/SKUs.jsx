import React, { useState } from 'react';
import { Tags, Layers } from 'lucide-react';
import MasterList from '../components/MasterList';
import BomModal from '../components/BomModal';

export default function SKUs() {
  const [bomSku, setBomSku] = useState(null);

  return (
    <>
      <MasterList
        title="SKUs"
        subtitle="Your product / part catalog — what you quote and deliver. Set a recipe (BOM) to fabricate in-house."
        endpoint="skus"
        attachEntity="sku"
        icon={Tags}
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
          { key: 'hsn', label: 'HSN', placeholder: '7308' },
          { key: 'description', label: 'Description', wide: true, placeholder: 'Optional details / specification' },
        ]}
        columns={[
          { key: 'sku_code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'unit', label: 'Unit' },
          { key: 'price', label: 'Price', render: r => (r.price != null ? `₹${Number(r.price).toLocaleString('en-IN')}` : '—') },
          { key: 'hsn', label: 'HSN' },
        ]}
      />
      {bomSku && <BomModal sku={bomSku} onClose={() => setBomSku(null)} />}
    </>
  );
}
