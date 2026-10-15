/* Send somebody's invitation again (POST /admin/users/:id/invite).

   A new link replaces the old one. When the server can send email it goes
   straight to them; when it cannot, the link is copied for the owner to
   send, and failing that it is shown to copy by hand — it is returned only
   this once. Returns true when something was sent or handed over. */
import { getToken } from './apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function reinvite(user, toast) {
  const t = getToken();
  const res = await fetch(`${API}/admin/users/${user.id}/invite`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { toast.error(body.error || 'Could not send the invitation'); return false; }
  const name = user.name || user.email;
  if (body.invite?.emailed) {
    toast.success(`Invitation emailed again to ${user.email}. The earlier link no longer works.`);
    return true;
  }
  const link = `${window.location.origin}${body.invite?.path || ''}`;
  try {
    await navigator.clipboard.writeText(link);
    toast.info(`${body.invite?.emailError || 'The email could not be sent'}. A new link for ${name} is copied — send it to them.`);
  } catch {
    window.prompt(`Send ${name} this link (it works once, for seven days):`, link);
  }
  return true;
}
