# POC — Project Architecture & Technical Documentation

> **Project:** Construction Project Management Platform (POC)
> **Author:** Abhishek Gupta
> **Created:** May 2026
> **Stack:** Node.js + Express + SQLite (Backend) | React + Vite + TailwindCSS (Frontend)

---

## 1. Overview

This is a full-stack **Construction Project Management** web application built as a Proof of Concept (POC). It manages the complete lifecycle of infrastructure projects — from project creation and vendor onboarding, through work orders, BOQ, indents, purchase orders, GRN, measurement books, all the way to RA Bill generation.

The platform is designed around the **ORR (Outer Ring Road) Package** use case for HMDA (Hyderabad Metropolitan Development Authority), but is generic enough for any civil/infrastructure project.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                      │
│                                                             │
│   React 19 + Vite + TailwindCSS + React Router DOM         │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│   │Dashboard │ │Projects  │ │WorkOrders│ │ BOQ / MB    │ │
│   └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│   │ Indent   │ │   GRN    │ │   Bills  │ │  ORR Map    │ │
│   └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │
│                         │ Axios HTTP                        │
└─────────────────────────│───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               BACKEND (Node.js + Express)                    │
│                    Port: 5000                                │
│                                                             │
│   REST API Endpoints (see Section 5)                        │
│   Controllers: ProjectController, WorkOrderController,       │
│                BillController                               │
│   Routes: /grn, /indent, /boq, /mb, /po, /vendors, etc.   │
│                         │                                   │
│                         ▼                                   │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              SQLite Database (db.js)                 │  │
│   │              File: backend/database.sqlite           │  │
│   └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Folder Structure

```
poc/
├── backend/                        # Node.js Express Backend
│   ├── index.js                    # Express app entry point, all route definitions
│   ├── db.js                       # SQLite DB init, all CREATE TABLE statements + seed data
│   ├── database.sqlite             # SQLite database file (persisted data)
│   ├── controllers/
│   │   ├── ProjectController.js    # GET/POST projects
│   │   ├── WorkOrderController.js  # GET/POST work orders + milestones
│   │   └── BillController.js       # GET bills + POST generate RA bill
│   ├── routes/
│   │   ├── activities.js           # Activity log route
│   │   ├── bills.js                # Bills routes
│   │   ├── boq.js                  # Bill of Quantities routes
│   │   ├── dashboard.js            # Dashboard stats route
│   │   ├── grn.js                  # Goods Receipt Note routes
│   │   ├── indent.js               # Material Indent routes
│   │   ├── inventory.js            # Inventory routes
│   │   ├── mb.js                   # Measurement Book routes
│   │   ├── po.js                   # Purchase Order routes
│   │   └── vendors.js              # Vendor management routes
│   ├── models/                     # (Reserved for future ORM models)
│   ├── seed_massive.js             # Script to seed large-scale test data
│   ├── seed_edge_cases.js          # Script to seed edge case scenarios
│   ├── package.json
│   └── package-lock.json
│
├── frontend/                       # React + Vite Frontend
│   ├── index.html                  # HTML entry point
│   ├── vite.config.js              # Vite bundler config
│   ├── tailwind.config.js          # TailwindCSS config
│   ├── postcss.config.js           # PostCSS config
│   ├── src/
│   │   ├── main.jsx                # React app bootstrap
│   │   ├── App.jsx                 # Root component + routing
│   │   ├── App.css                 # Global styles
│   │   ├── index.css               # TailwindCSS directives
│   │   ├── context/
│   │   │   ├── ProjectContext.jsx  # Global project selection state
│   │   │   └── RoleContext.jsx     # Role-based access control context
│   │   ├── components/
│   │   │   ├── Sidebar.jsx         # Navigation sidebar component
│   │   │   └── ORRMap.jsx          # Interactive ORR map component (Leaflet)
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # Main dashboard with KPI charts
│   │   │   ├── Projects.jsx        # Project listing and management
│   │   │   ├── WorkOrders.jsx      # Work order management
│   │   │   ├── Milestones.jsx      # Milestone tracking
│   │   │   ├── Vendors.jsx         # Vendor registry
│   │   │   ├── BOQ.jsx             # Bill of Quantities
│   │   │   ├── Indent.jsx          # Material indent requests
│   │   │   ├── PurchaseOrders.jsx  # Purchase order management
│   │   │   ├── GRN.jsx             # Goods Receipt Note
│   │   │   ├── MeasurementBook.jsx # Site measurement recordings
│   │   │   ├── Bills.jsx           # RA Bill generation
│   │   │   ├── Inventory.jsx       # Material inventory tracking
│   │   │   ├── ProcessFlow.jsx     # Process flow visualization (ReactFlow)
│   │   │   └── ActivityLog.jsx     # Audit trail / activity log
│   │   └── assets/
│   │       └── hero.png            # Hero image asset
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── dist/                       # Production build output (pre-built)
│   ├── test_images/
│   │   └── ui_check.png            # UI screenshot for validation
│   ├── test_runner.cjs             # Automated UI test runner
│   ├── ui_check.cjs                # UI screenshot capture script
│   ├── README.md
│   ├── package.json
│   └── package-lock.json
│
├── test_images/                    # Project-level screenshots
│   ├── 1_massive_graph_view.png    # Screenshot: Graph/network view
│   └── 2_node_details_panel.png    # Screenshot: Node detail panel
│
├── Platform_Complete_Functionality.docx  # Full platform feature documentation
├── PROJECT_ARCHITECTURE.md         # This file — full architecture reference
└── package.json                    # Root-level package config
```

---

## 4. Database Schema (SQLite)

All tables are defined in `backend/db.js` and auto-created on first run.

### Tables

| Table | Description | Key Fields |
|-------|-------------|------------|
| `projects` | Top-level project registry | id, name, clientName, type, startDate, endDate, status |
| `work_orders` | Work orders under a project | id, projectId, vendorId, name, boqId, contractValue, status |
| `milestones` | Progress milestones per work order | id, workOrderId, name, plannedPercent, actualPercent, status |
| `vendors` | Vendor/contractor registry | id, projectId, name, type, pan, gstin, class, rating, status |
| `boq_items` | Bill of Quantities line items | id, projectId, itemCode, description, unit, estimatedQuantity, rate |
| `indents` | Material indent/request records | id, projectId, workOrderId, boqId, requestedQuantity, requiredDate, status |
| `purchase_orders` | Purchase orders raised | id, projectId, workOrderId, vendorId, itemName, quantity, status |
| `grn` | Goods Receipt Notes | id, projectId, workOrderId, poId, vehicleNumber, receivedQuantity, date |
| `measurement_book` | Site measurement recordings | id, projectId, workOrderId, boqId, chainage, length, width, depth, measuredQuantity |
| `bills` | RA (Running Account) Bills | id, projectId, workOrderId, grossAmount, tds, retention, netAmount, billedQuantity, status |
| `inventory` | Material inventory per project | id, projectId, itemName, quantity |
| `activities` | Audit/activity log | id, projectId, description, type, timestamp |

### Entity Relationship (ERD Summary)

```
projects
   └──< work_orders
            └──< milestones
            └──< measurement_book
            └──< bills
            └──< grn
   └──< boq_items
            └──< indents
            └──< measurement_book (via boqId)
   └──< vendors
   └──< purchase_orders
   └──< inventory
   └──< activities
```

---

## 5. Backend API Endpoints

All endpoints run on **`http://localhost:5000`**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List all projects |
| POST | `/projects` | Create new project |
| GET | `/work-orders` | List work orders (filter by ?projectId) |
| POST | `/work-orders` | Create work order |
| GET | `/milestones` | List milestones |
| GET | `/vendors` | List vendors (filter by ?projectId) |
| GET | `/boq` | List BOQ items (filter by ?projectId) |
| POST | `/boq` | Add BOQ item |
| GET | `/indent` | List indents (filter by ?projectId) |
| POST | `/indent` | Create indent request |
| GET | `/po` | List purchase orders (filter by ?projectId) |
| GET | `/grn` | List GRN records |
| POST | `/grn` | Create GRN |
| GET | `/mb` | List measurement book entries |
| POST | `/mb` | Add measurement book entry |
| GET | `/bills` | List RA bills |
| POST | `/bills/generate` | Generate new RA bill from MB data |
| GET | `/inventory` | List inventory (filter by ?projectId) |
| GET | `/dashboard` | Get dashboard stats/KPIs |

---

## 6. Frontend Pages & Features

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | KPI cards, charts (Recharts), project overview |
| Projects | `/projects` | Project CRUD, status management |
| Work Orders | `/work-orders` | WO listing, creation, status tracking |
| Milestones | `/milestones` | Milestone progress tracking |
| Vendors | `/vendors` | Vendor registry with PAN, GSTIN, rating |
| BOQ | `/boq` | Bill of Quantities management |
| Indent | `/indent` | Material indent requests linked to BOQ |
| Purchase Orders | `/purchase-orders` | PO tracking from Pending → Delivered |
| GRN | `/grn` | Goods Receipt Notes against POs |
| Measurement Book | `/mb` | Site measurement recordings with chainage |
| Bills | `/bills` | RA Bill generation from MB data |
| Inventory | `/inventory` | Real-time material stock tracking |
| Process Flow | `/process-flow` | Visual process flow (ReactFlow / Dagre) |
| Activity Log | `/activity-log` | Full audit trail of all actions |
| ORR Map | (embedded) | Interactive Leaflet map of ORR corridor |

---

## 7. Key Libraries Used

### Frontend
| Library | Version | Purpose |
|---------|---------|---------|
| React | 19.x | UI framework |
| Vite | 8.x | Build tool & dev server |
| TailwindCSS | 3.x | Utility-first CSS |
| React Router DOM | 7.x | Client-side routing |
| Axios | 1.x | HTTP client |
| Recharts | 3.x | Charts & data visualization |
| ReactFlow | 11.x | Process flow diagrams |
| Dagre | 0.8.x | Graph layout engine (for process flow) |
| Leaflet + React-Leaflet | 1.9.x / 5.x | Interactive maps |
| Lucide React | 1.x | Icon library |
| Date-fns | 4.x | Date formatting utilities |

### Backend
| Library | Version | Purpose |
|---------|---------|---------|
| Express | 5.x | REST API framework |
| sqlite3 | 6.x | SQLite database driver |
| cors | 2.x | Cross-Origin Resource Sharing |
| nodemon | 3.x | Auto-restart during development |

---

## 8. How to Run (Windows / Mac / Linux)

### Prerequisites
- **Node.js** v18+ → [https://nodejs.org](https://nodejs.org)
  - On Windows: tick "Install tools for native modules" during Node.js setup

### Step 1: Start Backend
```bash
cd backend
npm install       # First time only
node index.js     # Starts on http://localhost:5000
```

### Step 2: Start Frontend (new terminal)
```bash
cd frontend
npm install       # First time only
npm run dev       # Starts on http://localhost:5173
```

### Step 3: Open Browser
Navigate to → **http://localhost:5173**

### Optional: Re-seed the database
```bash
cd backend
node seed_massive.js      # Seeds large-scale test data
node seed_edge_cases.js   # Seeds edge case scenarios
```

---

## 9. Data Flow — End-to-End Example (Indent → GRN)

```
1. Project created → Project ID assigned
2. Vendor registered under project
3. Work Order created (linked to Project + Vendor + BOQ item)
4. BOQ items defined for the project
5. INDENT raised (Site Engineer requests material → linked to BOQ item)
6. PURCHASE ORDER raised (against Indent → Vendor assigned)
7. PO status: Pending → Approved → Dispatched → Delivered
8. GRN recorded (material physically received at site, linked to PO)
9. MEASUREMENT BOOK updated (quantities measured at chainage)
10. RA BILL generated (from MB data → Gross → TDS → Retention → Net Payable)
```

---

## 10. Notes for Developer

- The SQLite database file (`backend/database.sqlite`) is **included in this zip** — all demo data is pre-loaded.
- If you want a fresh DB, delete `database.sqlite` and restart the backend — it will auto-recreate all tables and seed data.
- The frontend connects to backend at `http://localhost:5000` (hardcoded in Axios calls).
- If you change the backend port, update the Axios base URL in the frontend pages.
- `frontend/dist/` contains a pre-built production bundle — you can serve it directly with any static server if needed.
