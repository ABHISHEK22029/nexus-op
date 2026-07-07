import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Check, Paperclip } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import Attachments from './Attachments';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* Reusable owner-scoped master (Customers / SKUs / Raw Materials).
   config: { title, subtitle, endpoint, icon, fields[], columns[], attachEntity } */
export default function MasterList({ title, subtitle, endpoint, icon: Icon, fields, columns, attachEntity, summaryField, summaryLabel, rowAction }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [attachRow, setAttachRow] = useState(null);

  const empty = () => Object.fromEntries(fields.map(f => [f.key, '']));

  const load = async () => {
    try {
      const r = await fetch(`${API}/${endpoint}`);
      setRows(r.ok ? await r.json() : []);
    } catch { setRows([]); }
  };
  useEffect(() => { load(); }, [endpoint]);

  const openNew = () => { setEditing(null); setForm(empty()); setShowForm(true); };
  const openEdit = (row) => { setEditing(row.id); setForm({ ...empty(), ...row }); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault();
    const missing = fields.filter(f => f.required && !String(form[f.key] ?? '').trim());
    if (missing.length) { toast.error(`${missing[0].label} is required`); return; }
    const body = {};
    fields.forEach(f => { body[f.key] = form[f.key] === '' ? null : form[f.key]; });
    try {
      const url = editing ? `${API}/${endpoint}/${editing}` : `${API}/${endpoint}`;
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success(editing ? `${title} updated` : `${title} added`);
      setShowForm(false); setEditing(null); load();
    } catch (err) { toast.error(err.message); }
  };

  const del = async (row) => {
    if (!window.confirm(`Delete "${row[fields[0].key] || row.name}"?`)) return;
    try {
      const res = await fetch(`${API}/${endpoint}/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success('Deleted'); load();
    } catch (err) { toast.error(err.message); }
  };

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14 };
  const input = { width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' };
  const lbl = { display: 'block', fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {Icon && <Icon size={24} style={{ color: 'var(--brand-amber)' }} />} {title}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>{subtitle}</p>
        </div>
        <button onClick={openNew} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Add {title.replace(/s$/, '')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={save} style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{editing ? `Edit ${title.replace(/s$/, '')}` : `New ${title.replace(/s$/, '')}`}</div>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {fields.map(f => (
              <div key={f.key} style={{ gridColumn: f.wide ? '1 / -1' : 'auto' }}>
                <label style={lbl}>{f.label}{f.required && <span style={{ color: 'var(--accent-red)' }}> *</span>}</label>
                {f.type === 'select' ? (
                  <select style={input} value={form[f.key] ?? ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })}>
                    {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input style={input} type={f.type || 'text'} placeholder={f.placeholder || ''} value={form[f.key] ?? ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={15} /> {editing ? 'Save' : 'Add'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {summaryField && rows.length > 0 && (
        <div style={{ ...card, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{summaryLabel || `Total ${title}`}</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-amber)', fontFamily: 'var(--font-mono)' }}>
            ₹{rows.reduce((s, r) => s + (Number(r[summaryField]) || 0), 0).toLocaleString('en-IN')}
          </span>
        </div>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-muted)' }}>
            {Icon && <Icon size={38} style={{ opacity: 0.35, marginBottom: 10 }} />}
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No {title.toLowerCase()} yet</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Click “Add {title.replace(/s$/, '')}” to create one.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {columns.map(c => <th key={c.key} style={{ padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{c.label}</th>)}
                <th style={{ padding: '11px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {columns.map(c => <td key={c.key} style={{ padding: '11px 14px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}
                  <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {rowAction && (
                      <button onClick={() => rowAction.onClick(row)} title={rowAction.title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', cursor: 'pointer', color: 'var(--brand-amber)', padding: '5px 10px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 700, marginRight: 8 }}>
                        {rowAction.icon} {rowAction.label}
                      </button>
                    )}
                    {attachEntity && <button onClick={() => setAttachRow(row)} title="Attachments" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 4 }}><Paperclip size={15} /></button>}
                    <button onClick={() => openEdit(row)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginRight: 4 }}><Pencil size={15} /></button>
                    <button onClick={() => del(row)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {attachRow && (
        <div onClick={() => setAttachRow(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, boxShadow: 'var(--shadow-md)', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{attachRow[fields[0].key] || attachRow.name}</div>
              <button onClick={() => setAttachRow(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <Attachments entityType={attachEntity} entityId={attachRow.id} label="Documents" />
          </div>
        </div>
      )}
    </div>
  );
}
