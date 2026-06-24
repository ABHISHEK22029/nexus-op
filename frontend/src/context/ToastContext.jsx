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

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((type, message, opts = {}) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, message }]);
    const ttl = opts.duration ?? (type === 'error' ? 5000 : 3200);
    setTimeout(() => remove(id), ttl);
    return id;
  }, [remove]);

  const toast = {
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
    warning: (m, o) => push('warning', m, o),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, pointerEvents: 'none' }}>
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          const accent = ACCENT[t.type] || '#3b82f6';
          return (
            <div key={t.id} style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 11,
              background: 'var(--bg-elevated, #1a2233)', color: 'var(--text-primary, #e6eaf2)',
              border: '1px solid var(--border-default, #2a3346)', borderLeft: `3px solid ${accent}`,
              borderRadius: 10, padding: '12px 14px', boxShadow: '0 12px 32px -10px rgba(0,0,0,.55)',
              fontSize: 14, lineHeight: 1.4, animation: 'toastIn .28s cubic-bezier(.16,1,.3,1)',
            }}>
              <Icon size={18} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>{t.message}</span>
              <button onClick={() => remove(t.id)} style={{ background: 'none', border: 0, color: 'inherit', opacity: .5, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
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
  return ctx || { success: () => {}, error: () => {}, info: () => {}, warning: () => {} };
}
