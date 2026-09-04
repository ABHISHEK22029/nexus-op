import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Contact, TrendingUp } from 'lucide-react';
import MasterList from '../components/MasterList';

export default function Customers() {
  const navigate = useNavigate();
  return (
    <MasterList
      rowAction={{
        label: 'Insights',
        title: 'What they buy, what they owe, whether they pay on time',
        icon: <TrendingUp size={13} />,
        onClick: (row) => navigate(`/customers/${row.id}`),
      }}
      title="Customers"
      subtitle="The companies you sell to — a customer order starts here."
      endpoint="customers"
      attachEntity="customer"
      icon={Contact}
      fields={[
        { key: 'name', label: 'Customer Name', required: true, placeholder: 'e.g. TSTRANSCO' },
        /* What they actually buy. A customer list of name, GSTIN and state
           says nothing about which of them wants fire-rated doors and which
           wants handrails — the one thing that tells the rows apart for the
           person reading them. The category is the organisation's own
           vocabulary; the sentence is the detail behind it. */
        { key: 'requirement_category', label: 'Requirement', type: 'category', categoryKind: 'customer',
          placeholder: 'e.g. Fire doors, Handrails, Cladding' },
        { key: 'requirement', label: 'Requirement Detail', wide: true,
          placeholder: 'e.g. 90-minute fire-rated doors for hospital projects, powder-coated, site-measured' },
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
      /* "What they buy" sits second, right after the name: it is the column
         a person scans this list for. GSTIN and phone are lookups you go
         to a row for, not what you read across. */
      columns={[
        { key: 'name', label: 'Customer' },
        {
          key: 'requirement_category', label: 'Requirement',
          render: r => (r.requirement_category || r.requirement)
            ? (
              <span title={r.requirement || ''}>
                {r.requirement_category
                  ? <span style={{
                      display: 'inline-block', fontSize: '0.72rem', fontWeight: 700,
                      padding: '2px 9px', borderRadius: 999,
                      background: 'hsl(28,100%,54%,0.12)', color: 'var(--brand-amber)',
                    }}>{r.requirement_category}</span>
                  : null}
                {r.requirement && (
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.requirement}
                  </span>
                )}
              </span>
            )
            : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>not recorded</span>,
        },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'state', label: 'Billing State' },
        { key: 'shipping_state', label: 'Ships To' },
        { key: 'contact_name', label: 'Contact' },
      ]}
    />
  );
}
