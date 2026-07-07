import React from 'react';
import { Wallet } from 'lucide-react';
import MasterList from '../components/MasterList';

export default function Expenses() {
  return (
    <MasterList
      title="Expenses"
      subtitle="Off-PO costs — diesel, labour, freight, equipment hire, petty cash."
      endpoint="expenses"
      icon={Wallet}
      attachEntity="expense"
      summaryField="amount"
      summaryLabel="Total Recorded Spend"
      fields={[
        { key: 'expense_date', label: 'Date', type: 'date' },
        { key: 'category', label: 'Category', type: 'select', options: ['Diesel / Fuel', 'Labour / Wages', 'Freight / Transport', 'Equipment Hire', 'Consumables', 'Petty Cash', 'Utilities', 'Repairs', 'Other'] },
        { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
        { key: 'paid_to', label: 'Paid To' },
        { key: 'payment_mode', label: 'Mode', type: 'select', options: ['Cash', 'Bank', 'UPI', 'Cheque', 'Card'] },
        { key: 'reference', label: 'Reference' },
        { key: 'description', label: 'Description', wide: true, required: true, placeholder: 'What was this for?' },
      ]}
      columns={[
        { key: 'expense_date', label: 'Date', render: r => (r.expense_date ? new Date(r.expense_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—') },
        { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description' },
        { key: 'paid_to', label: 'Paid To' },
        { key: 'payment_mode', label: 'Mode' },
        { key: 'amount', label: 'Amount', render: r => `₹${Number(r.amount || 0).toLocaleString('en-IN')}` },
      ]}
    />
  );
}
