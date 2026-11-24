/* ══════════════════════════════════════════════════════════
   useBulkAction — the ticked rows, one action, a preview first.

   1. Asks the server what would happen (a dry run: nothing changes).
   2. If none can be done, says why and stops.
   3. Otherwise asks, in the app's own box: "Mark 3 invoices as sent?",
      naming any that will be skipped and why.
   4. Runs it, then "3 marked sent · 1 skipped: INV-0004, already sent".

   The server runs each record through the same route a single click uses,
   so a record the rules refuse comes back as skipped, in their words.
   ══════════════════════════════════════════════════════════ */
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SHOW = 5;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const listSkipped = (skipped) => {
  const lines = skipped.slice(0, SHOW).map(s => `• ${s.label}: ${s.reason.replace(/\.$/, '').toLowerCase()}`);
  if (skipped.length > SHOW) lines.push(`• and ${skipped.length - SHOW} more`);
  return lines.join('\n');
};

/**
 * @param {object} q          the list (useListQuery): reload and selection
 * @param {string} endpoint   e.g. 'sales-invoices' → POST /sales-invoices/bulk
 */
export function useBulkAction(q, endpoint) {
  const { confirm } = useConfirm();
  const toast = useToast();

  const post = async (body) => {
    const token = getToken();
    const r = await fetch(`${API}/${endpoint}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `That didn't work (${r.status})`);
    return d;
  };

  /**
   * @param {object} a
   * @param {string} a.action      the server's name for it ('mark_sent')
   * @param {string} a.verb        past tense for the result ('marked sent')
   * @param {(n:number)=>string} a.title   the question ("Mark 3 invoices as sent?")
   * @param {(n:number)=>string} a.confirmLabel   the button ("Mark 3 sent")
   * @param {string} [a.message]   what it does, said once
   * @param {[string,string]} a.noun   ['invoice', 'invoices']
   */
  return async function run(ids, a) {
    if (!ids?.length) return;
    let preview;
    try { preview = await post({ action: a.action, ids, dryRun: true }); }
    catch (e) { toast.error(e.message); return; }

    const { done, skipped } = preview;
    if (!done.length) {
      toast.error(`None of these can be ${a.verb}.\n${listSkipped(skipped)}`, { duration: 7000 });
      return;
    }
    const parts = [a.message, skipped.length
      ? `${plural(skipped.length, `${a.noun[0]} is`, `${a.noun[1]} are`)} skipped:\n${listSkipped(skipped)}`
      : null].filter(Boolean);
    const ok = await confirm({ title: a.title(done.length), message: parts.join('\n\n') || undefined, confirmLabel: a.confirmLabel(done.length) });
    if (!ok) return;

    let result;
    try { result = await post({ action: a.action, ids: done.map(d => d.id) }); }
    catch (e) { toast.error(e.message); q.reload(); return; }
    const n = result.done.length, m = result.skipped.length + skipped.length;
    const head = `${plural(n, a.noun[0], a.noun[1])} ${a.verb}`;
    if (result.skipped.length) {
      toast.warning(`${head} · ${plural(m, 'skipped', 'skipped')}\n${listSkipped([...result.skipped, ...skipped])}`, { duration: 7000 });
    } else {
      toast.success(m ? `${head} · ${m} skipped` : head);
    }
    q.selection.clear();
    q.reload();
  };
}
