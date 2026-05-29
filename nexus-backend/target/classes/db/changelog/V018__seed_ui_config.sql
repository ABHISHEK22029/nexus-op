-- V018__seed_ui_config.sql
-- Default UI configuration values
-- Modify these via SQL to change the React UI without any code redeploy

INSERT INTO ui_config (config_key, module, component, config_type, value, description) VALUES

-- ═══════════════════════════════════════════════════════════════
-- GLOBAL
-- ═══════════════════════════════════════════════════════════════
('global.app.name',          'global', 'Topbar',   'page_title',
 '{"title": "Nexus-OP", "subtitle": "Operational Intelligence"}',
 'Application name in topbar'),

('global.app.logo',          'global', 'Sidebar',  'image',
 '{"url": "/assets/logo.svg", "alt": "Nexus-OP", "width": 32, "height": 32}',
 'Sidebar logo'),

('global.app.primary_color', 'global', 'App',      'image',
 '{"hex": "#2563EB"}',
 'Primary brand color'),

-- Feature flags (toggle modules on/off via SQL)
('feature.expenses',         'global', 'Sidebar',  'feature_flag',
 '{"enabled": false}',
 'Show/hide Expenses module'),

('feature.chatbot',          'global', 'App',      'feature_flag',
 '{"enabled": false}',
 'Show/hide AI chatbot widget'),

('feature.geo_map',          'global', 'Sidebar',  'feature_flag',
 '{"enabled": true}',
 'Show/hide Site Map module'),

('feature.vendor_portal',    'global', 'App',      'feature_flag',
 '{"enabled": false}',
 'Enable vendor-facing portal login'),

-- Dashboard
('dashboard.banner',         'dashboard', 'Dashboard', 'banner',
 '{"active": false, "type": "info", "title": "", "message": "", "dismissible": true}',
 'Optional info/warning banner shown at top of dashboard'),

('dashboard.scurve',         'dashboard', 'Dashboard', 'feature_flag',
 '{"enabled": true}',
 'Show/hide S-curve chart'),

-- ═══════════════════════════════════════════════════════════════
-- VENDORS MODULE
-- ═══════════════════════════════════════════════════════════════
('vendor.form.title',        'vendor', 'VendorForm', 'page_title',
 '{"title": "New Vendor", "subtitle": "Add a supplier or contractor"}',
 'Vendor form page heading'),

('vendor.form.gstin.label',  'vendor', 'VendorForm', 'field_label',
 '{"text": "GSTIN", "required_marker": false}',
 'GSTIN field label'),

('vendor.form.gstin.placeholder', 'vendor', 'VendorForm', 'field_placeholder',
 '{"text": "22AAAAA0000A1Z5"}',
 'GSTIN input placeholder'),

('vendor.form.gstin.hint',   'vendor', 'VendorForm', 'field_hint',
 '{"text": "15-character GST Identification Number"}',
 'GSTIN help text below field'),

('vendor.form.bank.visible', 'vendor', 'VendorForm', 'section_visibility',
 '{"visible": true}',
 'Show/hide Bank Details tab'),

('vendor.form.compliance.visible', 'vendor', 'VendorForm', 'section_visibility',
 '{"visible": true}',
 'Show/hide Compliance tab'),

('vendor.form.contractor_class.options', 'vendor', 'VendorForm', 'dropdown_options',
 '{"options": [
    {"value": "Special", "label": "Special Class — Above ₹500 Cr"},
    {"value": "A",       "label": "Class A — Above ₹100 Cr"},
    {"value": "B",       "label": "Class B — ₹25 Cr to ₹100 Cr"},
    {"value": "C",       "label": "Class C — ₹5 Cr to ₹25 Cr"},
    {"value": "D",       "label": "Class D — Below ₹5 Cr"}
  ]}',
 'Contractor class dropdown options'),

('vendor.form.type.options', 'vendor', 'VendorForm', 'dropdown_options',
 '{"options": [
    {"value": "Civil",           "label": "Civil Contractor"},
    {"value": "Material",        "label": "Material Supplier"},
    {"value": "Equipment",       "label": "Equipment Provider"},
    {"value": "Labour",          "label": "Labour Contractor"},
    {"value": "Electrical",      "label": "Electrical"},
    {"value": "Consultant",      "label": "Consultant"},
    {"value": "Transporter",     "label": "Transporter"},
    {"value": "IT Hardware",     "label": "IT Hardware"}
  ]}',
 'Vendor type dropdown options'),

('vendor.table.columns',     'vendor', 'VendorTable', 'table_columns',
 '{"visible": ["name", "type", "gstin", "phone", "paymentTerms", "retentionPct", "status"]}',
 'Visible columns in vendor list table'),

-- ═══════════════════════════════════════════════════════════════
-- PURCHASE ORDERS MODULE
-- ═══════════════════════════════════════════════════════════════
('po.form.title',            'po', 'POForm',   'page_title',
 '{"title": "New Purchase Order", "subtitle": "Create a procurement order"}',
 'PO form heading'),

('po.form.tds.visible',      'po', 'POForm',   'field_visibility',
 '{"visible": true}',
 'Show/hide TDS section on PO form'),

('po.table.columns',         'po', 'POTable',  'table_columns',
 '{"visible": ["poNumber", "vendor", "project", "grandTotal", "expectedDelivery", "status"]}',
 'Visible columns in PO list table'),

-- ═══════════════════════════════════════════════════════════════
-- BILLS MODULE
-- ═══════════════════════════════════════════════════════════════
('bills.page.title',         'bills', 'Bills',  'page_title',
 '{"title": "RA Bills", "subtitle": "Running Account Bills for Work Orders"}',
 'Bills page heading'),

('bills.submit.button',      'bills', 'BillCard', 'button_text',
 '{"text": "Submit for Approval"}',
 'Submit button text on bill card'),

('bills.approve.button',     'bills', 'BillCard', 'button_text',
 '{"text": "Approve Bill"}',
 'Approve button text'),

-- ═══════════════════════════════════════════════════════════════
-- MILESTONES MODULE
-- ═══════════════════════════════════════════════════════════════
('milestone.update.button',  'milestone', 'MilestoneCard', 'button_text',
 '{"text": "Update Progress"}',
 'Progress update button label'),

('milestone.photo.required', 'milestone', 'ProgressModal', 'field_validation',
 '{"required": false}',
 'Require photo evidence when updating milestone %')

ON CONFLICT (config_key) DO NOTHING;
