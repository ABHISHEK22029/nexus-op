import React from 'react';
import { Contact } from 'lucide-react';
import MasterList from '../components/MasterList';

export default function Customers() {
  return (
    <MasterList
      title="Customers"
      subtitle="The companies you sell to — a customer order starts here."
      endpoint="customers"
      attachEntity="customer"
      icon={Contact}
      fields={[
        { key: 'name', label: 'Customer Name', required: true, placeholder: 'e.g. TSTRANSCO' },
        { key: 'gstin', label: 'GSTIN', placeholder: '36AAACT1234C1Z9' },
        { key: 'pan', label: 'PAN', placeholder: 'AAACT1234C' },
        { key: 'contact_name', label: 'Contact Person', placeholder: 'GM Projects' },
        { key: 'phone', label: 'Phone', placeholder: '98850 00000' },
        { key: 'email', label: 'Email', type: 'email', placeholder: 'buyer@company.com' },
        { key: 'billing_address', label: 'Billing Address', wide: true, placeholder: 'Registered address the invoice is billed to' },
        { key: 'state', label: 'Billing State', placeholder: 'Telangana' },
        /* Ship-to is a separate address, and it matters twice over: the goods
           physically go there, and under GST the place of supply — which
           decides CGST+SGST vs IGST — follows it, not the billing address. */
        { key: 'shipping_address', label: 'Shipping Address', wide: true, placeholder: 'Delivery site — leave blank if same as billing' },
        { key: 'shipping_state', label: 'Shipping State (Place of Supply)', placeholder: 'Decides CGST+SGST vs IGST' },
        { key: 'payment_terms_days', label: 'Payment Terms (days)', type: 'number', placeholder: '30' },
        { key: 'credit_limit', label: 'Credit Limit', type: 'number', placeholder: 'Optional' },
        { key: 'tags', label: 'Tags', placeholder: 'e.g. hospital projects, government tenders' },
      ]}
      columns={[
        { key: 'name', label: 'Customer' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'state', label: 'Billing State' },
        { key: 'shipping_state', label: 'Ships To' },
        { key: 'contact_name', label: 'Contact' },
        { key: 'phone', label: 'Phone' },
      ]}
    />
  );
}
