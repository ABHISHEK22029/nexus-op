import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const QuickCreateModal = ({ type, isOpen, onClose, onSuccess }) => {
  const { activeProject, fetchProjects } = useProject();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form states
  const [vendors, setVendors] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [boqItems, setBoqItems] = useState([]);

  // Project fields
  const [projName, setProjName] = useState('');
  const [projClient, setProjClient] = useState('');
  const [projType, setProjType] = useState('construction');
  const [projStart, setProjStart] = useState('');
  const [projEnd, setProjEnd] = useState('');

  // Vendor fields
  const [vendorName, setVendorName] = useState('');
  const [vendorType, setVendorType] = useState('Civil');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorPan, setVendorPan] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');

  // Indent fields
  const [indentWO, setIndentWO] = useState('');
  const [indentBOQ, setIndentBOQ] = useState('');
  const [indentQty, setIndentQty] = useState('');
  const [indentDate, setIndentDate] = useState('');
  const [indentChainage, setIndentChainage] = useState('');

  // PO fields
  const [poWO, setPoWO] = useState('');
  const [poVendor, setPoVendor] = useState('');
  const [poItem, setPoItem] = useState('');
  const [poQty, setPoQty] = useState('');
  const [poPrice, setPoPrice] = useState('');

  // Fetch dropdown contexts on load
  useEffect(() => {
    if (!isOpen) return;

    if (activeProject) {
      // Fetch vendors
      fetch(`http://localhost:5000/vendors?projectId=${activeProject.id}`)
        .then(res => res.json())
        .then(data => {
          setVendors(data);
          if (data.length > 0) setPoVendor(data[0].id);
        });

      // Fetch work orders
      fetch(`http://localhost:5000/work-orders?projectId=${activeProject.id}`)
        .then(res => res.json())
        .then(data => {
          setWorkOrders(data);
          if (data.length > 0) {
            setIndentWO(data[0].id);
            setPoWO(data[0].id);
          }
        });

      // Fetch BOQ items
      fetch(`http://localhost:5000/boq?projectId=${activeProject.id}`)
        .then(res => res.json())
        .then(data => {
          setBoqItems(data);
          if (data.length > 0) setIndentBOQ(data[0].id);
        });
    }
  }, [isOpen, activeProject]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let url = '';
    let body = {};

    try {
      if (type === 'project') {
        url = 'http://localhost:5000/projects';
        body = {
          name: projName,
          clientName: projClient,
          type: projType,
          startDate: projStart,
          endDate: projEnd,
          status: 'Active'
        };
        if (!projName || !projClient) throw new Error('Name and Client are required');
      } else if (type === 'vendor') {
        url = 'http://localhost:5000/vendors';
        body = {
          projectId: activeProject?.id || null,
          name: vendorName,
          type: vendorType,
          contact: vendorContact,
          pan: vendorPan,
          gstin: vendorGstin,
          rating: 90
        };
        if (!vendorName) throw new Error('Vendor Name is required');
      } else if (type === 'indent') {
        url = 'http://localhost:5000/indent';
        body = {
          projectId: activeProject?.id,
          workOrderId: parseInt(indentWO),
          boqId: parseInt(indentBOQ),
          requestedQuantity: parseInt(indentQty),
          requiredDate: indentDate,
          chainage: indentChainage
        };
        if (!activeProject) throw new Error('No active project context');
        if (!indentWO || !indentBOQ || !indentQty) throw new Error('Work Order, BOQ, and Quantity are required');
      } else if (type === 'po') {
        url = 'http://localhost:5000/po';
        body = {
          projectId: activeProject?.id,
          workOrderId: parseInt(poWO),
          vendorId: parseInt(poVendor),
          itemName: poItem,
          quantity: parseInt(poQty),
          unitPrice: parseFloat(poPrice || 0)
        };
        if (!activeProject) throw new Error('No active project context');
        if (!poWO || !poVendor || !poItem || !poQty) throw new Error('Work Order, Vendor, Item Name, and Quantity are required');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server error occurred');
      }

      if (type === 'project') {
        fetchProjects(); // reload project context dropdown
      }

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '6px'
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    outline: 'none',
    transition: 'border-color 150ms ease'
  };

  const renderFormFields = () => {
    switch (type) {
      case 'project':
        return (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Project Name *</label>
              <input
                type="text"
                placeholder="e.g. ORR Package 5 (NE)"
                value={projName}
                onChange={e => setProjName(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Client Name *</label>
              <input
                type="text"
                placeholder="e.g. HMDA"
                value={projClient}
                onChange={e => setProjClient(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Project Type</label>
              <select
                value={projType}
                onChange={e => setProjType(e.target.value)}
                style={inputStyle}
              >
                <option value="construction">Construction (Roads/Infrastructure)</option>
                <option value="generic">Generic/Commercial Services</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Start Date</label>
                <input
                  type="date"
                  value={projStart}
                  onChange={e => setProjStart(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>End Date</label>
                <input
                  type="date"
                  value={projEnd}
                  onChange={e => setProjEnd(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        );
      case 'vendor':
        return (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Vendor/Contractor Name *</label>
              <input
                type="text"
                placeholder="e.g. Megha Engineering Ltd."
                value={vendorName}
                onChange={e => setVendorName(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Vendor Category</label>
              <select
                value={vendorType}
                onChange={e => setVendorType(e.target.value)}
                style={inputStyle}
              >
                <option value="Civil">Civil Works / Earthmoving</option>
                <option value="Material">Material Supplier (Steel, Cement, Bitumen)</option>
                <option value="Equipment">Equipment Rental</option>
                <option value="IT Hardware">IT & Electronic Hardware</option>
              </select>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Contact Number</label>
              <input
                type="text"
                placeholder="+91 XXXXX XXXXX"
                value={vendorContact}
                onChange={e => setVendorContact(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>PAN Number</label>
                <input
                  type="text"
                  placeholder="ABCDE1234F"
                  value={vendorPan}
                  onChange={e => setVendorPan(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>GSTIN</label>
                <input
                  type="text"
                  placeholder="36ABCDE1234F1Z5"
                  value={vendorGstin}
                  onChange={e => setVendorGstin(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        );
      case 'indent':
        return (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Work Order Assignment *</label>
              <select
                value={indentWO}
                onChange={e => setIndentWO(e.target.value)}
                style={inputStyle}
                required
              >
                {workOrders.length === 0 ? (
                  <option value="">No Active Work Orders</option>
                ) : (
                  workOrders.map(wo => (
                    <option key={wo.id} value={wo.id}>{wo.name}</option>
                  ))
                )}
              </select>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>BOQ Line Item *</label>
              <select
                value={indentBOQ}
                onChange={e => setIndentBOQ(e.target.value)}
                style={inputStyle}
                required
              >
                {boqItems.length === 0 ? (
                  <option value="">No BOQ Items Defined</option>
                ) : (
                  boqItems.map(item => (
                    <option key={item.id} value={item.id}>[{item.itemCode}] {item.description}</option>
                  ))
                )}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Requested Quantity *</label>
                <input
                  type="number"
                  placeholder="Enter qty"
                  value={indentQty}
                  onChange={e => setIndentQty(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Required Date</label>
                <input
                  type="date"
                  value={indentDate}
                  onChange={e => setIndentDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Chainage / Site Coordinates</label>
              <input
                type="text"
                placeholder="e.g. CH 14+500"
                value={indentChainage}
                onChange={e => setIndentChainage(e.target.value)}
                style={inputStyle}
              />
            </div>
          </>
        );
      case 'po':
        return (
          <>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Work Order Context *</label>
              <select
                value={poWO}
                onChange={e => setPoWO(e.target.value)}
                style={inputStyle}
                required
              >
                {workOrders.length === 0 ? (
                  <option value="">No Active Work Orders</option>
                ) : (
                  workOrders.map(wo => (
                    <option key={wo.id} value={wo.id}>{wo.name}</option>
                  ))
                )}
              </select>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Supplier Vendor *</label>
              <select
                value={poVendor}
                onChange={e => setPoVendor(e.target.value)}
                style={inputStyle}
                required
              >
                {vendors.length === 0 ? (
                  <option value="">No Vendors Registered</option>
                ) : (
                  vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                  ))
                )}
              </select>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Material / Item Name *</label>
              <input
                type="text"
                placeholder="e.g. Reinforcement Steel 12mm"
                value={poItem}
                onChange={e => setPoItem(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Quantity *</label>
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={poQty}
                  onChange={e => setPoQty(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Unit Price (₹)</label>
                <input
                  type="number"
                  placeholder="Price per unit"
                  value={poPrice}
                  onChange={e => setPoPrice(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'project': return 'Create New Project';
      case 'vendor': return 'Register New Vendor';
      case 'indent': return 'Raise Material Indent';
      case 'po': return 'Raise Purchase Order';
      default: return 'Quick Create';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          background: 'var(--bg-surface)',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modalSlideIn 200ms ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-elevated)'
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {getTitle()}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 150ms'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--border-subtle)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '20px', overflowY: 'auto', maxHeight: '70vh' }}>
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: 'hsl(0, 84%, 60%)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  marginBottom: '14px',
                  fontWeight: 500
                }}
              >
                {error}
              </div>
            )}
            {renderFormFields()}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              background: 'var(--bg-elevated)'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : null}
              {loading ? 'Saving...' : 'Save & Close'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickCreateModal;
