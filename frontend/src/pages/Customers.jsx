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
        { key: 'state', label: 'State', placeholder: 'Telangana' },
        { key: 'contact_name', label: 'Contact Person', placeholder: 'GM Projects' },
        { key: 'phone', label: 'Phone', placeholder: '98850 00000' },
        { key: 'email', label: 'Email', type: 'email', placeholder: 'buyer@company.com' },
        { key: 'billing_address', label: 'Billing Address', wide: true, placeholder: 'Full billing address' },
      ]}
      columns={[
        { key: 'name', label: 'Customer' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'state', label: 'State' },
        { key: 'contact_name', label: 'Contact' },
        { key: 'phone', label: 'Phone' },
      ]}
    />
  );
}
