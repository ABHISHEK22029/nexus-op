import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Upload, Trash2, FileText, Image as ImageIcon, Loader2, ExternalLink } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const fmtSize = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/* Reusable file attachments for any record.
   <Attachments entityType="grn_bill" entityId={id} label="Documents" /> */
export default function Attachments({ entityType, entityId, label = 'Attachments', compact = false }) {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const load = async () => {
    if (!entityType || !entityId) return;
    try {
      const r = await fetch(`${API}/attachments?entityType=${entityType}&entityId=${entityId}`);
      setFiles(r.ok ? await r.json() : []);
    } catch { setFiles([]); }
  };
  useEffect(() => { load(); }, [entityType, entityId]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large (max 10 MB)'); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    setBusy(true);
    try {
      const res = await fetch(`${API}/attachments`, { method: 'POST', body: fd }); // token added by interceptor; boundary preserved
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      toast.success(`Attached ${file.name}`);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const openFile = async (f) => {
    try {
      const res = await fetch(`${API}/attachments/${f.id}/download`);
      if (!res.ok) throw new Error('Could not open file');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast.error(err.message); }
  };

  const del = async (f) => {
    if (!window.confirm(`Remove "${f.filename}"?`)) return;
    try { await fetch(`${API}/attachments/${f.id}`, { method: 'DELETE' }); toast.success('Removed'); load(); }
    catch { toast.error('Failed to remove'); }
  };

  const isImg = (m) => (m || '').startsWith('image/');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: compact ? '0.85rem' : '0.95rem', color: 'var(--text-primary)' }}>
          <Paperclip size={15} style={{ color: 'var(--brand-amber)' }} /> {label} {files.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({files.length})</span>}
        </div>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />} Upload
        </button>
        <input ref={inputRef} type="file" onChange={onPick} style={{ display: 'none' }} />
      </div>

      {files.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '6px 2px' }}>No files yet — attach a challan, photo, cheque or document.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{isImg(f.mime) ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
              <button onClick={() => openFile(f)} title="Open" style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
                <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtSize(f.size_bytes)}</span>
              <button onClick={() => del(f)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0 }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
