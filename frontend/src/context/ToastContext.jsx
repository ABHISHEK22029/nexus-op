import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = { success: CheckCircle, error: XCircle, info: Info, warning: AlertTriangle };
const ACCENT = {
  success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const schedule = useCallback((id, ms) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => remove(id), ms));
  }, [remove]);

  /* opts.action = { label, onClick } puts a button on the toast ("Undo").
     A toast with a button stays longer, and holds still while the pointer
     is on it, so the button can't vanish under the click. */
  const push = useCallback((type, message, opts = {}) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, message, action: opts.action || null }]);
    const ttl = opts.duration ?? (opts.action ? 7000 : type === 'error' ? 5000 : 3200);
    schedule(id, ttl);
    return id;
  }, [schedule]);

  const toast = {
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
    warning: (m, o) => push('warning', m, o),
    /* Undo instead of "are you sure": the change is made at once, and for
       seven seconds one click puts it back. For changes that can be put
       back — a status, not a delete. */
    undo: (m, onUndo, o = {}) => push('success', m, { ...o, action: { label: 'Undo', onClick: onUndo } }),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 'min(380px, calc(100vw - 36px))', pointerEvents: 'none' }}>
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          const accent = ACCENT[t.type] || '#3b82f6';
          return (
            /* A role, so a screen reader reads the message out: an error
               interrupts (alert), anything else waits its turn (status). */
            <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} data-toast={t.type}
              onMouseEnter={t.action ? () => clearTimeout(timers.current.get(t.id)) : undefined}
              onMouseLeave={t.action ? () => schedule(t.id, 3000) : undefined}
              style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 11,
              background: 'var(--bg-elevated, #1a2233)', color: 'var(--text-primary, #e6eaf2)',
              border: '1px solid var(--border-default, #2a3346)', borderLeft: `3px solid ${accent}`,
              borderRadius: 10, padding: '12px 14px', boxShadow: '0 12px 32px -10px rgba(0,0,0,.55)',
              fontSize: 14, lineHeight: 1.4, animation: 'toastIn .28s cubic-bezier(.16,1,.3,1)',
            }}>
              <Icon size={18} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1, whiteSpace: 'pre-line' }}>{t.message}</span>
              {t.action && (
                <button type="button" data-toast-action
                  onClick={() => { remove(t.id); t.action.onClick(); }}
                  style={{ background: 'none', border: 0, padding: '0 2px', flexShrink: 0, cursor: 'pointer',
                    font: 'inherit', fontWeight: 700, color: 'var(--brand-amber, #d97706)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  {t.action.label}
                </button>
              )}
              <button onClick={() => remove(t.id)} aria-label="Dismiss" style={{ background: 'none', border: 0, color: 'inherit', opacity: .5, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  // graceful fallback so a missing provider never crashes a page
  return ctx || { success: () => {}, error: () => {}, info: () => {}, warning: () => {}, undo: () => {} };
}
