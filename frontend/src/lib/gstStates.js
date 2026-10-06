/* GST state codes — the same table the server uses (backend/shared/gstStates.js).
   The place of supply decides CGST+SGST against IGST, so the invoice
   builder picks it from this list rather than from a free-text box, where
   "TN", "Tamilnadu" and "Tamil Nadu" were three different states. */
export const GST_STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'],
  ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'],
  ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'],
  ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'],
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'],
  ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'],
  ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory'],
];

const BY_NAME = new Map(GST_STATES.map(([c, n]) => [n.toLowerCase(), c]));
const ALIASES = { tn: '33', tamilnadu: '33', ap: '37', up: '09', mp: '23', wb: '19', telengana: '36', orissa: '21', 'new delhi': '07' };

/** Code from a code, a name, an alias or a full GSTIN — or null. */
export function stateCode(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{2}/.test(s)) { const c = s.slice(0, 2); return GST_STATES.some(([k]) => k === c) ? c : null; }
  const n = s.toLowerCase().replace(/\s+/g, ' ');
  return BY_NAME.get(n) || ALIASES[n] || null;
}

export const stateName = (code) => GST_STATES.find(([c]) => c === code)?.[1] || '';
