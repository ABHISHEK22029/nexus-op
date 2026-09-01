/* ══════════════════════════════════════════════════════════
   Vendors — the directory and what each vendor supplies, in one place.

   These were two sidebar entries, "Vendors" and "Vendor Supplies". They are
   one subject: who we buy from, and what they sell us. Split across two
   destinations, "who supplies plate?" was answered on a different screen
   from "who are our vendors?", and neither showed the other.

   Now one screen, two tabs, tab held in the URL so it can be linked and
   bookmarked.

   The list itself also moved to server-side search: it previously fetched
   every vendor for the active project and filtered in the browser, and
   returned nothing at all when no project was selected — a blank screen
   that looked like "you have no vendors".
   ══════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileUp, Trash2, Users, Link2, Building2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../context/PermissionContext';
import {
  useListQuery, ListToolbar, Pagination, EmptyState,
  SavedViews, BulkBar, SelectAllCell, SelectCell,
} from '../components/ListToolbar';
import PageTabs, { useActiveTab } from '../components/PageTabs';
import { getToken } from '../lib/apiAuth';
import VendorSupplies from './VendorSupplies';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const TABS = [
  { key: 'directory', label: 'Directory', icon: <Users size={14} /> },
  { key: 'supplies', label: 'What they supply', icon: <Link2 size={14} /> },
];

export default function Vendors() {
  const [tab, setTab] = useActiveTab(TABS, 'directory');

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          <Building2 size={24} style={{ color: 'var(--brand-amber)' }} /> Vendors
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Who you buy from, and what each one sells you — with the price, minimum order and lead time
          that a purchase order needs.
        </p>
      </header>

      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'directory' ? <Directory /> : <VendorSupplies embedded />}
    </div>
  );
}

/* ── Tab 1: the directory ─────────────────────────────────── */
function Directory() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const [bulkLoading, setBulkLoading] = useState(false);
  const q = useListQuery('vendors', { pageSize: 25 });

  const del = async (e, vendor) => {
    e.stopPropagation();
    if (!window.confirm(`Delete vendor "${vendor.name}"? This cannot be undone.`)) return;
    const token = getToken();
    const res = await fetch(`${API}/vendors/${vendor.id}`, {
      method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return toast.error(b.detail || b.error || 'Could not delete');
    }
    toast.success('Vendor deleted');
    q.reload();
  };

  const bulkUpload = async (e) => {
    if (!e.target.files[0]) return;
    setBulkLoading(true);
    try {
      const token = getToken();
      await fetch(`${API}/vendors/bulk`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      toast.success('Import queued');
      q.reload();
    } catch (err) { toast.error(err.message || 'Import failed'); }
    finally { setBulkLoading(false); e.target.value = null; }
  };

  const canWrite = can('vendors', 'write');
  const canDelete = can('vendors', 'delete');

  /* One confirmation for the whole selection, and it names the count —
     "Delete 12 vendors?" is a different question from "Delete this vendor?"
     and should read like one. Failures are reported per record rather than
     as a single "something went wrong": with a foreign key on purchase
     orders, some will refuse and some will not, and the user needs to know
     which. */
  const bulkDelete = async (ids) => {
    if (!window.confirm(`Delete ${ids.length} vendor${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const token = getToken();
    const results = await Promise.all(ids.map(async id => {
      const res = await fetch(`${API}/vendors/${id}`, {
        method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { id, ok: res.ok };
    }));
    const failed = results.filter(r => !r.ok);
    if (failed.length === 0) toast.success(`Deleted ${ids.length}`);
    else if (failed.length === ids.length) toast.error('None could be deleted — they may be used on purchase orders');
    else toast.error(`Deleted ${ids.length - failed.length}; ${failed.length} could not be (in use elsewhere)`);
    q.selection.clear();
    q.reload();
  };

  return (
    <>
      <SavedViews q={q} />
      <ListToolbar
        q={q}
        placeholder="Search vendor, type, city, GSTIN or contact…"
        filters={[{
          key: 'type',
          label: 'Type',
          options: [
            { value: 'Material Supply', label: 'Material' },
            { value: 'Logistics', label: 'Logistics' },
            { value: 'Construction', label: 'Construction' },
            { value: 'Maintenance', label: 'Maintenance' },
          ],
        }]}
        right={canWrite && (
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
              <FileUp size={14} /> {bulkLoading ? 'Importing…' : 'Import'}
              <input type="file" accept=".xls,.xlsx,.csv" onChange={bulkUpload} style={{ display: 'none' }} />
            </label>
            <button onClick={() => navigate('/vendors/new')} className="btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Plus size={14} /> Add vendor
            </button>
          </div>
        )}
      />

      <BulkBar
        q={q}
        noun="vendors"
        actions={canDelete ? [{
          label: 'Delete',
          danger: true,
          icon: <Trash2 size={13} />,
          onClick: bulkDelete,
        }] : []}
      />

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
        {q.rows.length === 0 ? (
          <EmptyState q={q} icon={Users} noun="vendors" hint="Add your first supplier to start raising purchase orders." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg-elevated)', textAlign: 'left' }}>
                {canDelete && <SelectAllCell q={q} />}
                {['Vendor', 'Type', 'Supplies', 'Contact', ''].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {q.rows.map(v => (
                  <tr key={v.id}
                      style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                      onClick={() => navigate(`/vendors/${v.id}/edit`)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {canDelete && <SelectCell q={q} id={v.id} />}
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{v.name}</div>
                      {(v.city || v.state) && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {[v.city, v.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                        {v.type || '—'}
                      </span>
                    </td>
                    <td style={td}>
                      {v.capability_tags ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {String(v.capability_tags).split(',').map(t => t.trim()).filter(Boolean).slice(0, 3).map(tag => (
                            <span key={tag} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(245,158,11,0.12)', color: '#b45309' }}>{tag}</span>
                          ))}
                        </div>
                      ) : <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ ...td, fontSize: '0.82rem' }}>
                      {v.contactName || v.contactPhone ? (
                        <>
                          {v.contactName && <div>{v.contactName}</div>}
                          {v.contactPhone && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{v.contactPhone}</div>}
                        </>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {canDelete && (
                        <button onClick={e => del(e, v)} title="Delete vendor"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination q={q} />
    </>
  );
}

const th = { padding: '11px 14px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' };
const td = { padding: '12px 14px', fontSize: '0.86rem', color: 'var(--text-primary)', verticalAlign: 'top' };
