import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../lib/apiAuth';

/* The signed-in user's notifications, refreshed every minute while mounted.
   Used by the avatar menu (AccountButton) and the standalone bell. */
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const headers = () => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

export default function useNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      const r = await fetch(`${API}/notifications`, { headers: headers() });
      if (!r.ok) return;
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.items || []);
      setItems(list);
      setUnread(typeof d.unread === 'number' ? d.unread : list.filter(n => !n.is_read).length);
    } catch { /* offline: keep what we have */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const every = setInterval(load, 60000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [load]);

  const openItem = useCallback(async (n) => {
    if (!n.is_read) {
      await fetch(`${API}/notifications/${n.id}/read`, { method: 'PATCH', headers: headers() }).catch(() => {});
    }
    if (n.link) navigate(n.link);
    load();
  }, [navigate, load]);

  const readAll = useCallback(async () => {
    await fetch(`${API}/notifications/read-all`, { method: 'POST', headers: headers() }).catch(() => {});
    load();
  }, [load]);

  return { items, unread, load, openItem, readAll };
}
