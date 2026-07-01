import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FolderKanban, ClipboardList, Truck, ReceiptText, Rocket, X, ArrowRight, ArrowLeft } from 'lucide-react';

/* A lightweight, dependency-free guided tour shown once to brand-new users
   after they finish onboarding. Triggered by the `nexus_tour_pending` flag
   (set at signup) — existing users and the admin never see it. */
const STEPS = [
  { icon: Rocket,         color: '#f97316', title: 'Welcome to Nexus-OP 👋', body: 'This is your own workspace. Everything you create — projects, bills, materials — is private to you. Let’s take 30 seconds to see how it fits together.' },
  { icon: FolderKanban,   color: '#3b82f6', title: 'Projects are your home base', body: 'Every workflow lives inside a project. Use the “Context” selector at the top to switch between projects. You just created your first one during setup.' },
  { icon: ClipboardList,  color: '#8b5cf6', title: 'Plan the work: BOQ → Indent', body: 'Add your Bill of Quantities (BOQ), then raise Indents when the site needs materials. This is where execution starts.' },
  { icon: Truck,          color: '#10b981', title: 'Procure & receive: PO → GRN', body: 'Turn indents into Purchase Orders for vendors, then record Goods Receipt Notes (GRN) as materials arrive on site.' },
  { icon: ReceiptText,    color: '#ef4444', title: 'Get paid: Measurement Book → RA Bills', body: 'Record measured work, then generate professional GST-compliant RA Bills with automatic deductions (TDS, retention, and more).' },
  { icon: LayoutDashboard,color: '#0ea5e9', title: 'Your dashboard ties it together', body: 'Live totals for vendors, POs, inventory and billing update as you work. You’re all set — start from the left sidebar whenever you’re ready.' },
];

export default function ProductTour() {
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (localStorage.getItem('nexus_tour_pending') === '1') {
      setActive(true);
    }
  }, []);

  const close = () => {
    localStorage.removeItem('nexus_tour_pending');
    localStorage.setItem('nexus_tour_seen', '1');
    setActive(false);
  };

  if (!active) return null;
  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', overflow: 'hidden', animation: 'tourpop 220ms cubic-bezier(0.34,1.56,0.64,1)' }}>
        {/* Header band */}
        <div style={{ height: 6, background: step.color, transition: 'background 250ms ease' }} />

        <div style={{ padding: '28px 28px 24px', position: 'relative' }}>
          <button onClick={close} title="Skip tour" style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={18} />
          </button>

          <div style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${step.color}1a`, border: `1px solid ${step.color}55`, marginBottom: 18 }}>
            <Icon size={28} style={{ color: step.color }} />
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px', letterSpacing: '-0.02em' }}>{step.title}</h2>
          <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>{step.body}</p>

          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 24 }}>
            {STEPS.map((s, idx) => (
              <div key={idx} style={{ height: 6, flex: idx === i ? 2 : 1, borderRadius: 99, background: idx === i ? step.color : idx < i ? 'var(--text-muted)' : 'var(--border-default)', transition: 'all 250ms ease' }} />
            ))}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
            <button onClick={close} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
              Skip
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              {i > 0 && (
                <button onClick={() => setI(i - 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                  <ArrowLeft size={14} /> Back
                </button>
              )}
              <button onClick={() => (last ? close() : setI(i + 1))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, background: step.color, border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 14px ${step.color}55` }}>
                {last ? 'Start using Nexus-OP' : 'Next'} {!last && <ArrowRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes tourpop { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>
    </div>
  );
}
