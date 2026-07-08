import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingCart, Package, Activity,
  Receipt, Workflow, FileText, ClipboardList, BookOpen, Truck,
  FolderGit2, Briefcase, Milestone, Zap, Home, Sun, Moon, Factory,
  Contact, ShoppingBag, Tags, Boxes, Files, ReceiptIndianRupee,
  Wallet, BarChart3, FileSpreadsheet, UserCog, Cog, FileMinus, PackageCheck
} from 'lucide-react';
import { useRole } from '../context/RoleContext';
import { useProject } from '../context/ProjectContext';
import { useTheme } from '../context/ThemeContext';

const Sidebar = () => {
  const { role } = useRole();
  const { enabledModules } = useProject();
  const { theme, toggleTheme, isDark } = useTheme();

  const baseNavItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={18} />, group: 'Overview' },
    { name: 'Smart Knowledge', path: '/knowledge', icon: <BookOpen size={18} />, group: 'Overview' },

    // ── Sales & customer orders (NEW) ──
    { name: 'Customers', path: '/customers', icon: <Contact size={18} />, group: 'Sales' },
    { name: 'Sales Quotations', path: '/sales-quotations', icon: <FileText size={18} />, group: 'Sales' },
    { name: 'Customer Orders', path: '/customer-orders', icon: <ShoppingBag size={18} />, group: 'Sales' },
    { name: 'Delivery Challans', path: '/delivery-challans', icon: <PackageCheck size={18} />, group: 'Sales' },
    { name: 'Sales Invoices', path: '/sales-invoices', icon: <ReceiptIndianRupee size={18} />, group: 'Sales' },

    // ── Catalog (NEW) ──
    { name: 'SKUs', path: '/skus', icon: <Tags size={18} />, group: 'Catalog' },
    { name: 'Raw Materials', path: '/raw-materials', icon: <Boxes size={18} />, group: 'Catalog' },

    // ── Procurement (flow order: Vendors → Quotations → Vendor PO → GRN → Inventory) ──
    { name: 'Vendors', path: '/vendors', icon: <Users size={18} />, group: 'Procurement' },
    { name: 'Quotations', path: '/quotations', icon: <Files size={18} />, group: 'Procurement' },
    { name: 'Purchase Orders', path: '/po', icon: <ShoppingCart size={18} />, group: 'Procurement' },
    { name: 'GRN', path: '/grn', icon: <Truck size={18} />, group: 'Procurement' },
    { name: 'Inventory', path: '/inventory', icon: <Package size={18} />, group: 'Procurement' },

    // ── Billing ──
    { name: 'RA Bills', path: '/bills', icon: <Receipt size={18} />, group: 'Billing' },
    { name: 'Payables', path: '/payables', icon: <ReceiptIndianRupee size={18} />, group: 'Billing' },
    { name: 'Credit/Debit Notes', path: '/credit-debit-notes', icon: <FileMinus size={18} />, group: 'Billing' },
    { name: 'Expenses', path: '/expenses', icon: <Wallet size={18} />, group: 'Billing' },

    // ── Projects ──
    { name: 'Projects', path: '/projects', icon: <FolderGit2 size={18} />, group: 'Project' },
    { name: 'Work Orders', path: '/workorders', icon: <Briefcase size={18} />, group: 'Project' },

    // ── Fabrication ──
    { name: 'Production', path: '/production', icon: <Factory size={18} />, group: 'Fabrication' },

    // ── System ──
    { name: 'Automation', path: '/automation', icon: <Cog size={18} />, group: 'System' },
    { name: 'Reports', path: '/reports', icon: <BarChart3 size={18} />, group: 'System' },
    { name: 'Import Data', path: '/import', icon: <FileSpreadsheet size={18} />, group: 'System' },
    { name: 'Team & Access', path: '/users', icon: <UserCog size={18} />, group: 'System' },
    { name: 'Activity Log', path: '/activity', icon: <Activity size={18} />, group: 'System' },
    { name: 'Process Flow', path: '/flow', icon: <Workflow size={18} />, group: 'System' },
  ];

  const moduleNavItems = [
    { name: 'BOQ', path: '/boq', icon: <FileText size={18} />, requiredModule: 'BOQ', group: 'Project' },
    { name: 'Indent', path: '/indent', icon: <ClipboardList size={18} />, requiredModule: 'Indent', group: 'Procurement' },
    { name: 'Measurement Book', path: '/mb', icon: <BookOpen size={18} />, requiredModule: 'Measurement Book', group: 'Billing' },
    { name: 'Milestones', path: '/milestones', icon: <Milestone size={18} />, requiredModule: 'Milestones', group: 'Project' },
  ];

  const allNavItems = [
    ...baseNavItems,
    ...moduleNavItems.filter((item) => enabledModules.includes(item.requiredModule)),
  ];

  const getNavItemsForRole = () => {
    switch (role) {
      case 'Engineer':
        return allNavItems.filter(i => ['Smart Knowledge', 'Purchase Orders', 'Inventory', 'Raw Materials', 'SKUs', 'Quotations', 'Production', 'Delivery Challans', 'Process Flow', 'Indent', 'GRN', 'Measurement Book'].includes(i.name));
      case 'Finance':
        return allNavItems.filter(i => ['Dashboard', 'Smart Knowledge', 'Customers', 'Sales Quotations', 'Customer Orders', 'Delivery Challans', 'Sales Invoices', 'Quotations', 'RA Bills', 'Payables', 'Credit/Debit Notes', 'Expenses', 'Reports', 'Activity Log', 'BOQ'].includes(i.name));
      case 'Vendor':
        return allNavItems.filter(i => ['Purchase Orders'].includes(i.name));
      case 'Admin':
      default:
        return allNavItems;
    }
  };

  const navItems = getNavItemsForRole();

  // Group items
  const groups = ['Overview', 'Sales', 'Catalog', 'Procurement', 'Billing', 'Project', 'Fabrication', 'System'];
  const grouped = groups.reduce((acc, g) => {
    const items = navItems.filter(i => i.group === g);
    if (items.length) acc[g] = items;
    return acc;
  }, {});

  return (
    <div
      className="app-sidebar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px hsl(28,100%,54%,0.4)',
            flexShrink: 0,
          }}
        >
          <Zap size={16} color="#fff" fill="#fff" />
        </div>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1rem',
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--brand-amber) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Nexus Op
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>
            Beta v1.0
          </div>
        </div>
      </div>

      {/* Back to landing */}
      <div style={{ padding: '12px 12px 0' }}>
        <NavLink
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            transition: 'all 200ms',
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <Home size={14} />
          Back to Landing
        </NavLink>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '0' }}>
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} style={{ marginBottom: '4px' }}>
            <div
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                padding: '10px 12px 4px',
              }}
            >
              {group}
            </div>
            {items.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                className="sidebar-link"
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: isActive ? 'var(--brand-amber)' : 'var(--text-muted)',
                  background: isActive ? 'hsl(28, 100%, 54%, 0.1)' : 'transparent',
                  border: isActive ? '1px solid hsl(28, 100%, 54%, 0.2)' : '1px solid transparent',
                  textDecoration: 'none',
                  marginBottom: '2px',
                  transition: 'all 150ms ease',
                })}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.querySelector('svg')?.style?.color?.includes('brand-amber'))
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  // Let the isActive styles re-apply via CSS class
                }}
              >
                <span style={{ opacity: 0.8 }}>{item.icon}</span>
                {item.name}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer — Status only (theme toggle moved to header) */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.68rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span
            style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: 'var(--accent-emerald)', flexShrink: 0,
              boxShadow: '0 0 6px var(--accent-emerald)',
            }}
          />
          Backend :5000 · Frontend :5173
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
