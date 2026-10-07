import React from 'react';
import { Lock } from 'lucide-react';

/* The customer's browser: what a stranger sees at your catalogue's
   address. Always light — it is their screen and your public page, not the
   app — whatever theme the visitor has chosen for maksops.co.in. */
export default function PublicWindow({ path, children }) {
  return (
    <div className="fm-public">
      <div className="fm-chrome is-browser">
        <span className="fl-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="fm-url is-public"><Lock size={11} /> maksops.co.in<b>{path}</b></span>
        <span className="fm-who is-customer">Customer’s screen</span>
      </div>
      <div className="fm-public-page">{children}</div>
    </div>
  );
}
