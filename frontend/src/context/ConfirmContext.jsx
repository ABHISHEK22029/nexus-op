/* ══════════════════════════════════════════════════════════
   ConfirmContext — "are you sure?" in the product's own voice.

   The browser's confirm box is grey, says the site's address at the top,
   puts OK where people expect Cancel on some systems, and cannot be
   styled. This is one dialog for the whole app, in MaksOps' look: a title
   that says what is about to happen, a sentence on what it means, the
   confirm button worded for the action ("Delete order", "Dispatch") and red
   when it cannot be undone. Esc or a click outside cancels; Enter confirms.

   From the agent portal's ConfirmAlert / DialogRequest pattern, made into a
   promise so a call site stays one line:

       const { confirm, prompt } = useConfirm();
       if (!(await confirm({ title: 'Delete CO-0012?', message: '…', confirmLabel: 'Delete', tone: 'danger' }))) return;
       const reason = await prompt({ title: 'Reverse this payment?', label: 'Why', required: true });

   In an automated browser (navigator.webdriver) the browser's own boxes
   are used, so the end-to-end suites answer them as they always have;
   localStorage "maks_app_dialogs" = "1" turns this dialog on there too.
   ══════════════════════════════════════════════════════════ */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';

const Ctx = createContext(null);

const useNative = () => {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver && localStorage.getItem('maks_app_dialogs') !== '1';
  } catch { return false; }
};

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);

  const confirm = useCallback((o = {}) => {
    if (useNative()) return Promise.resolve(window.confirm([o.title, o.message].filter(Boolean).join('\n\n')));
    return new Promise(resolve => setReq({ kind: 'confirm', ...o, resolve }));
  }, []);
  const prompt = useCallback((o = {}) => {
    if (useNative()) {
      const v = window.prompt([o.title, o.message, o.label].filter(Boolean).join('\n\n'), o.initial || '');
      return Promise.resolve(v == null ? null : v);
    }
    return new Promise(resolve => setReq({ kind: 'prompt', ...o, resolve }));
  }, []);

  const close = (value) => { req?.resolve(value); setReq(null); };

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      {req && createPortal(<Dialog req={req} onClose={close} />, document.body)}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  /* Outside the provider (a test harness, an isolated render): the browser's own. */
  return ctx || {
    confirm: async (o = {}) => window.confirm([o.title, o.message].filter(Boolean).join('\n\n')),
    prompt: async (o = {}) => window.prompt([o.title, o.message, o.label].filter(Boolean).join('\n\n'), o.initial || ''),
  };
}

function Dialog({ req, onClose }) {
  const [value, setValue] = useState(req.initial || '');
  const [err, setErr] = useState('');
  const okRef = useRef(null);
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const danger = req.tone === 'danger';
  const isPrompt = req.kind === 'prompt';

  /* The keyboard starts on the safe answer when the action can't be
     undone, so an Enter pressed out of habit doesn't delete anything. */
  useEffect(() => {
    (isPrompt ? inputRef.current : danger ? cancelRef.current : okRef.current)?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(isPrompt ? null : false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ok = () => {
    if (isPrompt) {
      if (req.required && !value.trim()) { setErr(req.requiredMessage || 'This is needed to go ahead.'); inputRef.current?.focus(); return; }
      onClose(value.trim());
    } else onClose(true);
  };

  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <div className="cd-overlay" data-app-dialog={req.kind} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(isPrompt ? null : false); }}>
      <div className="cd-panel" role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby={req.message ? 'cd-msg' : undefined}>
        <div className="cd-head">
          <span className={`cd-icon${danger ? ' is-danger' : ''}`} aria-hidden="true"><Icon size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 id="cd-title" className="cd-title">{req.title || 'Are you sure?'}</h2>
            {req.message && <p id="cd-msg" className="cd-msg" data-app-dialog-message>{req.message}</p>}
          </div>
        </div>
        {isPrompt && (
          <form className="cd-field" onSubmit={(e) => { e.preventDefault(); ok(); }}>
            {req.label && <label htmlFor="cd-input" className="cd-label">{req.label}</label>}
            {req.multiline ? (
              <textarea id="cd-input" ref={inputRef} className="cd-input" rows={3} value={value} placeholder={req.placeholder || ''}
                onChange={e => { setValue(e.target.value); setErr(''); }} />
            ) : (
              <input id="cd-input" ref={inputRef} className="cd-input" value={value} placeholder={req.placeholder || ''}
                onChange={e => { setValue(e.target.value); setErr(''); }} />
            )}
            {err && <div role="alert" className="cd-err">{err}</div>}
          </form>
        )}
        <div className="cd-actions">
          <button type="button" ref={cancelRef} className="cd-btn" onClick={() => onClose(isPrompt ? null : false)} data-app-dialog-cancel>
            {req.cancelLabel || 'Cancel'}
          </button>
          <button type="button" ref={okRef} className={`cd-btn cd-btn-ok${danger ? ' is-danger' : ''}`} onClick={ok} data-app-dialog-ok>
            {req.confirmLabel || (isPrompt ? 'Continue' : 'Yes, go ahead')}
          </button>
        </div>
      </div>
    </div>
  );
}
