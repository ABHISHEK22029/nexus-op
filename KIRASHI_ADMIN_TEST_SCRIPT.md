# Kirashi Admin — Full Test Drive Script

**You are:** Ravi, Admin at Kirashi Business Synergies (steel/power-infra fabrication).
**Goal:** Buy raw steel → fabricate V-Type Cross Arms → track yield & cost.
**App:** https://nexus-op-sn4d.vercel.app

> Tip: keep this open on one side and the app on the other. Each step lists **what to do**, **what to type**, and **what you should see**.

---

## PART 0 — Sign in (1 min)
1. Open https://nexus-op-sn4d.vercel.app → you land on the **landing page**.
2. Click **Test Beta** (or Sign In) → the login screen.
3. Click **"Try the demo account"** → it fills `admin@nexusop.com` / `admin123`.
4. Click **Sign In**.
   - ✅ You land on the **Dashboard**. Top-right shows **Admin · Full Access**.
   - *(Optional: create your own account instead via "Create an account" — you'll get a fresh empty workspace + a guided tour.)*

---

## PART 1 — Create your workspace / project (2 min)
1. Top bar → **Quick Create → New Project** (or Sidebar → **Projects → Add**).
2. Enter:
   - **Name:** `Kirashi Fab — TSTRANSCO Cross Arms`
   - **Client:** `TSTRANSCO`
   - **Type:** `construction`  *(this unlocks BOQ / Indent / Measurement modules)*
   - **Start:** today · **End:** +6 months
3. Save.
   - ✅ Project appears. Set it as active in the top **"Context:"** selector.

---

## PART 2 — Add a raw-material supplier (2 min)
1. Sidebar → **Vendors → Add Vendor** (or the 5-tab Vendor form).
2. Enter:
   - **Name:** `Sri Venkateswara Steels`
   - **Type:** `Raw Material / Steel`
   - **GSTIN:** `36AABCS1234C1Z5`  *(starts with 36 = Telangana → intra-state GST)*
   - **PAN:** `AABCS1234C`  · **Contact:** `Suresh` · **Phone:** `9885000000`
3. Save.
   - ✅ Vendor listed. (This is who you'll raise a PO to.)

---

## PART 3 — Define what you buy/make (BOQ) (2 min)
1. Sidebar → **BOQ → Add Item**.
2. Enter:
   - **Item Code:** `MSA-50` · **Description:** `MS Angle 50x50x6mm`
   - **Unit:** `kg` · **Estimated Qty:** `1200` · **Rate:** `62`
3. Save. (Add a 2nd if you like: `HW-01 / Fasteners & Bolts / kg / 50 / 95`.)
   - ✅ BOQ item(s) listed with rate.

---

## PART 4 — Buy raw material: Indent → PO → GRN → Inventory (6 min)
**4a. Raise an Indent (material request)**
1. Sidebar → **Indent → Raise New Indent**.
2. **Work Order:** leave as **"— No work order —"** (optional now).
   **Material:** `MS Angle 50x50x6mm` · **Qty:** `1000` · **Required date:** +7 days · **Chainage:** `Shop Floor A`.
3. Save → ✅ "Indent raised".
4. Set its status to **Approved** → ✅ it suggests **"Create PO for this indent?"**.

**4b. Create the Purchase Order**
1. Sidebar → **Purchase Orders → New PO** (or from the indent suggestion).
2. **Vendor:** `Sri Venkateswara Steels`. Add a line item:
   - **Description:** `MS Angle 50x50x6mm` · **UOM:** `kg` · **HSN:** `7216` · **Qty:** `1000` · **Unit Price:** `62`
3. Save → ✅ PO created with a number like `Kirashi/FY2026-27/001`.
4. Open the PO → **View Invoice** → ✅ clean **black-and-white** PO invoice; try **PDF** / **Print**.
   - *(Note: "Email Vendor" is not wired yet — it's a placeholder.)*

**4c. Move the PO through its lifecycle**
1. On the PO: **Approve** → status `Approved`.
2. **Dispatch** → status `Dispatched`.  *(GRN only works once Dispatched.)*

**4d. Receive the goods (GRN)**
1. Sidebar → **GRN → New GRN**.
2. **Select PO:** the one above · **Vehicle:** `TS09AB1234` · **Batch:** `HEAT-4471` · **Received Qty:** `980` *(20kg short — realistic).*
3. Save → ✅ short-delivery note appears; PO flips to **Delivered**.

**4e. Confirm stock updated**
1. Sidebar → **Inventory**.
   - ✅ `MS Angle 50x50x6mm` shows **980** in stock (auto-added by the GRN).

---

## PART 5 — ⭐ The fabrication job: Production & Yield (6 min)
*(This is the module built specifically for a fabricator like you.)*
1. Sidebar → **Fabrication → Production → New Production Order**.
2. **Producing:** `V-Type Cross Arms` · **Planned Qty:** `200` · **Unit:** `nos` → **Create & Open**.
3. On the order page, fill the three sections:
   - **Raw Material Consumed:** `MS Angle 50x50x6mm` · Qty `900` kg · ₹/kg `62` → **＋**
   - **Finished Output:** `V-Type Cross Arm` · Pcs `200` · Weight `760` kg → **＋**
   - **Scrap & Remnant:**
     - Type `Sellable scrap` · Qty `120` kg · Sale value `2640` · tick **Sold** → **＋**
     - Type `Reusable remnant` · Qty `20` kg → **＋**
4. Watch the **Yield & Material Balance** panel update live:
   - ✅ **Yield ≈ 84%** (760 ÷ 900), **Recovered ≈ 87%** (incl. remnant)
   - ✅ **Scrap ₹2,640 recovered**, **Unaccounted loss ≈ 0 kg → balanced ✓**
   - ✅ **Net material cost** = ₹55,800 − ₹2,640 = **₹53,160**, **Cost/piece ≈ ₹266**
5. Set the order to **In Progress → Completed** with the status buttons.
   - ✅ Back on the Production list: your order shows its **Yield %**, **Scrap ₹**, **Cost/Unit**, and the top tiles show **Avg Yield** and **Scrap Recovered**.

---

## PART 6 — See the whole business at a glance (2 min)
1. Sidebar → **Dashboard** → ✅ KPI cards (vendors, POs, delivered, inventory, billed), charts, milestones.
2. Sidebar → **Activity Log** → ✅ every action you just did is timestamped (PO created, GRN received, etc.) — filter/search, export CSV.
3. Sidebar → **Back to Landing** → ✅ you're **still logged in** (nav shows "Dashboard · Admin"). Return anytime.

---

## PART 7 — Billing: what fits, and the honest gap
- **If you do project/contract work** (bill a client for measured work): Sidebar → **Measurement Book** (record work) → **RA Bills → Generate** (auto GST + TDS + retention, professional B&W tax invoice, Draft→Approved→Paid lifecycle). This is fully built.
- **If you're SELLING finished cross-arms to a customer:** ⚠️ **this doesn't exist yet.** There is no Customer master or Sales/Tax Invoice — only purchasing (PO) and contractor billing (RA bill). This is the #1 thing to add to make the portal fully fit Kirashi's *sell* side.

---

## ✅ Quick test checklist
- [ ] Logged in; Admin shown top-right
- [ ] Created project + set as active context
- [ ] Added a steel vendor (with GSTIN)
- [ ] Added BOQ item(s)
- [ ] Indent raised → approved
- [ ] PO created → invoice is B&W → approved → dispatched
- [ ] GRN received → Inventory auto-updated
- [ ] Production order → consume / output / scrap entered
- [ ] Yield panel correct + balanced; cost/piece shown
- [ ] Dashboard + Activity Log reflect everything
- [ ] "Back to Landing" kept me logged in
- [ ] Noted: no customer sales-invoice flow yet (the gap)

---
### Known rough edges you'll notice (already on the list)
- Role dropdown (Engineer/Finance/etc.) only filters the sidebar — not enforced on the backend yet.
- "Email Vendor", bulk vendor import, and the map are placeholders.
- Tables are not yet mobile-optimised (use a laptop for this test).
- No file/photo attachments or approval notifications yet.
