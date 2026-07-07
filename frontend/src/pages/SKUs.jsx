import React from 'react';
import { Tags } from 'lucide-react';
import MasterList from '../components/MasterList';

export default function SKUs() {
  return (
    <MasterList
      title="SKUs"
      subtitle="Your product / part catalog — what you quote and deliver."
      endpoint="skus"
      attachEntity="sku"
      icon={Tags}
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
  );
}
