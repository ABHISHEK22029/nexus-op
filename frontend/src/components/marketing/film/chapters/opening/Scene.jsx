import React from 'react';
import { Sparkles } from 'lucide-react';
import { Show } from '../../../flow/kit';
import { MoMark } from '../../shell/marks';

/* 00 — one business, every operation connected; then the mark. */
const OPERATIONS = ['Catalogue', 'Enquiry', 'Quotation', 'Order', 'Stock', 'Purchase', 'Receipt', 'Production', 'Dispatch', 'Invoice'];

export const Icon = Sparkles;

export default function Scene({ t }) {
  const mark = t >= 4200;
  return (
    <div className="fm-open">
      {!mark ? (
        <div className="fm-open-lines">
          <Show on={t >= 250} className="fm-open-l1">One business.</Show>
          <Show on={t >= 1400} className="fm-open-l2">Every operation, connected.</Show>
          <div className="fm-open-ops">
            {OPERATIONS.map((op, i) => (
              <Show key={op} on={t >= 1900 + i * 190} from="up" as="span" className="fm-open-op">{op}</Show>
            ))}
          </div>
        </div>
      ) : (
        <div className="fm-open-mark fl-enter-soft">
          <MoMark size={112} />
          <b>Maks Ops</b>
          <Show on={t >= 5000} as="span">From catalogue to cash.</Show>
        </div>
      )}
    </div>
  );
}
