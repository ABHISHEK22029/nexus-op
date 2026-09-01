# RBAC & Admin phase — what was built, and what belongs where

Answers three questions: how RBAC is structured, what the Configurator should
own, and what is deliberately *not* in it.

---

## 1. The problem RBAC had

Three role vocabularies, none agreeing:

| Layer | Roles it knew about |
|---|---|
| Database | `Admin`, `User` |
| Backend checks | `Admin`, `Manager`, `Viewer` |
| UI dropdown | `Admin`, `Engineer`, `Finance`, `Vendor` |

So `requireRole('Admin','Manager')` could never match anyone — no account has
ever held `Manager`. Of 129 routes, **10** had any guard. The one real rule
was "Viewer is read-only", which is not access control but a single special
case: a Procurement user could raise **and approve** their own purchase
order, and a Sales user could edit the company's bank details.

The UI's "View as:" dropdown set a local variable and never touched the
token, so choosing a role changed nothing any server ever saw — while
looking exactly like a privilege switch.

### The deeper tangle

`Admin` meant two unrelated things at once:

- **Tenancy** — whose rows you see (`owner_id`)
- **Capability** — what actions you may perform

Which is why the product had no way to express its most common user: someone
who runs their own workspace completely but has no business reading another
company's data. Now:

- **Administrator** = the cross-tenant platform role
- **Owner** = full capability inside one workspace

All 17 literal `role === 'Admin'` checks became `isCrossTenant()`.

---

## 2. The seven roles

| Role | Covers | Cross-tenant |
|---|---|---|
| **Administrator** | Everything, every workspace, user accounts | ✅ |
| **Owner** | Their own workspace end to end. Not user management | — |
| **Sales** | Customers, quotations, orders, invoices, challans. Reads stock & production | — |
| **Procurement** | Vendors, POs, indents, GRN, materials, inventory | — |
| **Production** | Work orders, production, projects, BOQ, measurement book | — |
| **Finance** | Invoices, bills, payments, credit notes. **Approves POs** | — |
| **Viewer** | Reads everything, changes nothing | — |

**Separation of duty is expressed, not assumed.** Procurement holds `po`
write but *not* `po-approval` — raising and approving the same purchase order
must be two people, or the control is not a control. Finance approves.

**Nobody lost access.** Legacy `User` maps to `Owner`, not `Viewer`. Viewer
looks like the tighter default, but since only 10 routes were ever guarded, a
"User" could already do everything in their own workspace — mapping them to
read-only would have been a silent breaking downgrade dressed up as a
security improvement. `check-route-coverage.js` asserts this on every run.

---

## 3. How enforcement works

**Deny by default.** One middleware matches a request's first path segment to
a resource and checks the role's grants. A route whose resource isn't granted
is refused — so a new endpoint added without thought fails *closed*.

**The server is the only authority.** `/auth/me` returns the permission map;
the UI never keeps its own copy. A second copy of a permission table is a
copy that drifts, and a drifted permission table is worse than none because
it gets trusted. A test asserts the map equals `can()` exactly for all seven
roles.

**Hiding a button is courtesy, not security.** Every UI check has a server
twin. The UI reads permissions only so it doesn't dangle actions that will
come back 403.

**One map, two consumers.** `lib/navResources.js` maps URL → resource, and
both the sidebar (which links to show) and `RoleRoute` (which pages to open)
read it. They were about to be two lists, and two lists of the same thing
drift — the nav hides a link while the route still opens, or vice versa.

`RoleRoute` sits in `AppLayout`, not on each of 60 routes. Wrapping them
individually is more explicit and less safe: it guarantees the 61st is
forgotten.

---

## 4. Roles are configurable data

They were code constants — so changing a permission needed a developer and a
deploy, which is not how an ERP is administered. Migration 033 stores them,
seeded from exactly the code defaults.

Two safety properties matter more than the feature itself:

1. **The code remains the fallback.** If the tables are missing or
   unreachable, `can()` uses the compiled-in defaults. A failed migration
   degrades to yesterday's rules, not to an installation where nobody can do
   anything.
2. **`can()` stays synchronous**, backed by a cache refreshed on write.
   Making it async would turn a pure predicate into something every call site
   must `await` — and one missed `await` evaluates a Promise as truthy, which
   is to say, grants everything.

Verified: all **609** permission answers (7 roles × 29 resources × 3 actions)
identical before and after the migration.

---

## 5. What belongs in the Configurator

Your question was "what needs to be assigned in and what". My answer:

### In it now

| Tab | What it does |
|---|---|
| **People** | Who has an account, their role, active/inactive. Flags legacy roles that are being *mapped* rather than chosen |
| **Roles & permissions** | The read/write/delete grid, per role per resource. Create custom roles by copying an existing one |
| **Change history** | Who changed which permission, and when |

The permission editor is a **grid**, not per-role checkboxes, because
permissions are only meaningful in comparison — "can Procurement do this when
Finance can't?" should be one glance, not four page-loads.

### The guards are the substance

A permissions editor without them is a way to lock a company out of its own
installation, and the recovery path is a database console most SMEs don't
have:

- Administrator is **uneditable** and short-circuited in code — it's the recovery path
- You cannot change **your own** role or deactivate yourself
- The **last active Administrator** cannot be demoted or deactivated
- **System roles** cannot be deleted; code and docs name them
- A role with **users assigned** cannot be deleted until they're moved
- Unknown resources are **rejected**, not silently ignored — a typo that looks saved is worse than an error

### Deliberately NOT in it

- **`/admin/*` is not a grantable resource.** It's absent from `RESOURCES`, so deny-by-default makes it Administrator-only. A screen that changes who can do what must not itself be a permission you can hand out.
- **The resource catalogue is code, not data.** An admin can only grant permissions on things the product actually routes — they cannot invent a permission for something that doesn't exist.
- **Cross-tenant is not a checkbox.** Only Administrator has it. Exposing it in the UI would make "see every other company's data" a toggle.

### Worth adding later

- Company profile & bank details (currently its own page — arguably belongs here)
- Document numbering prefixes and financial-year reset
- Module toggles (already exist via `ProjectContext`, not yet administered)
- Approval thresholds (PO value above which sign-off is required)
- Password reset / invite flow for new users

---

## 6. Verification

Run before any push:

```bash
cd backend  && node scripts/check-placeholders.js     # SQL placeholders missing their $
cd backend  && node scripts/check-route-coverage.js   # orphan routes, lost access
cd frontend && node scripts/check-jsx-undefined.cjs   # JSX used without import
cd frontend && npm run build
```

End-to-end (needs a local server; refuses to run against a deployed host):

```bash
RBAC_ADMIN_EMAIL=… RBAC_ADMIN_PASSWORD=… RBAC_TEST_PASSWORD=… \
  bash backend/scripts/test-rbac-live.sh        # 18 checks
RBAC_ADMIN_EMAIL=… RBAC_ADMIN_PASSWORD=… RBAC_TEST_PASSWORD=… \
  bash backend/scripts/test-configurator.sh     # 22 checks
```

The configurator test proves a permission edited through the API actually
changes what the API allows: granting Sales write on vendors flips 403 → 400,
revoking flips it back.

### What to try by hand

- Sign in as **Procurement** → no Sales Invoices in the nav; `PATCH /po/:id/approval` returns 403
- Sign in as **Viewer** → everything visible, every save refused
- Sign in as **Sales** → Purchase Orders absent from nav; visiting `/purchase-orders` directly shows an explanation, not an empty table
- As Administrator, open **Configurator → Roles**, tick a box, save, then sign in as that role and confirm the change took effect

Switching roles means signing in as someone who has that role. There is no
"view as" — that control was theatre and is gone.

---

## 7. Known gaps

- **Password reset / user invite** — accounts are created via `/auth/register`; there's no admin-driven invite or reset yet.
- **No per-user overrides.** Permissions are per role only. "This one person may also approve POs" needs a new role today.
- **`role_change_log` is never pruned.** Fine at SME volume; worth a retention policy eventually.
- **Custom roles aren't seeded into new environments.** Only the seven built-ins are; a custom role must be recreated or the table copied.
