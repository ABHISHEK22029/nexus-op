/* The company name in the top bar and the side panel, remembered between
   visits. Both used to open on "Your organisation" and change to the real
   name a moment later, on every page load. Kept per signed-in person, so a
   shared computer never shows one company's name to another's user. */
const key = (user) => `maks.orgName.${user?.id ?? 'me'}`;

export const cachedOrgName = (user) => {
  try { return localStorage.getItem(key(user)) || ''; } catch { return ''; }
};

export const rememberOrgName = (user, org) => {
  const name = org?.tradeName || org?.name;
  try { if (name) localStorage.setItem(key(user), name); } catch { /* storage blocked */ }
};

/* undefined while the profile is loading: show the remembered name, or
   nothing, rather than a placeholder that is about to change. */
export const orgNameFor = (org, user) =>
  org?.tradeName || org?.name || cachedOrgName(user) || (org === undefined ? '' : 'Your organisation');
