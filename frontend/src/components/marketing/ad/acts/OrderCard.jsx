import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { PRODUCT, QTY, CUSTOMER } from '../../data/transaction';
import { IDS } from '../../flow/story';
import { box, ORDER_AT } from '../geo';

/* The customer order, CO-0012 — the record the second half of the ad is
   about. The quotation turns into it at the end of act 2, and act 3 opens
   with it in exactly the same place, so the cut between them is invisible:
   the order simply stays while everything around it changes. */
export default function OrderCard({ layout, on = true, className = '' }) {
  return (
    <div className={`ad-order is-${layout}${on ? ' is-on' : ''} ${className}`} style={box(ORDER_AT[layout])}>
      <span className="ad-order-ico"><ShoppingBag size={layout === 'narrow' ? 15 : 17} /></span>
      <span className="ad-order-main">
        <small>Customer order · <b>{IDS.co}</b></small>
        <b>{PRODUCT.name}</b>
        <span>{QTY} {PRODUCT.unit} · {CUSTOMER.short}</span>
      </span>
    </div>
  );
}
