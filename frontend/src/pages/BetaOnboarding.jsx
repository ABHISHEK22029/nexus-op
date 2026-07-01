import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import '../beta.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function BetaOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(2); // Start at step 2 (Org Setup)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { fetchProjects } = useProject();

  // Force light mode for the Cornerstone UI, then restore the user's saved theme on exit
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    return () => {
      // Restore the user's actual preference (default light) — do NOT hardcode dark
      document.documentElement.setAttribute('data-theme', localStorage.getItem('nexus-theme') || 'light');
    };
  }, []);

  // State
  const [org, setOrg] = useState({ name: '', tradeName: '', industry: 'Construction / EPC', gstin: '', pan: '', regType: 'Registered Business — Regular', state: 'Telangana', currency: 'INR — Indian Rupee (₹)', fyStart: 'April (Indian Standard)', retention: '5', tds: '194C — Contractors (2%)' });
  const [role, setRole] = useState('Project Manager');
  const [project, setProject] = useState({ name: '', code: '', contractNo: '', contractValue: '', clientName: '', fundingAgency: '', siteAddress: '', state: 'Telangana', lat: '', lng: '', startDate: '', endDate: '', pm: 'Abhishek Gupta (you)', se: '', retention: '5', tds: '194C — Contractors (2%)', contingency: '', priority: 'High' });

  const handleNext = async () => {
    if (step < 4) {
      setStep(step + 1);
      window.scrollTo(0, 0);
    } else {
      // Final submit
      setSaving(true);
      setError(null);
      try {
        const token = localStorage.getItem('nexus_token');
        const headers = { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) };

        // We only have the create project API right now, so we create the project.
        const res = await fetch(`${API}/projects`, {
          method: 'POST', headers,
          body: JSON.stringify({
            name: project.name || 'My First Project',
            clientName: project.clientName || 'Internal',
            type: 'construction',
            startDate: project.startDate || null,
            endDate: project.endDate || null,
            status: 'Active',
          }),
        });

        if (!res.ok) throw new Error('Failed to create project');

        await fetchProjects();
        setStep(5); // Show Tour/Loading briefly
        setTimeout(() => navigate('/dashboard'), 1500);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Something went wrong');
      } finally {
        setSaving(false);
      }
    }
  };

  const renderStepIndicator = () => (
    <div className="step-bar" style={{ marginBottom: '32px', borderRadius: '16px' }}>
      {[
        { n: 1, lbl: 'Welcome' },
        { n: 2, lbl: 'Org Setup' },
        { n: 3, lbl: 'Your Role' },
        { n: 4, lbl: 'First Project' },
        { n: 5, lbl: 'Tour' },
        { n: 6, lbl: 'Done' }
      ].map((s, i, arr) => (
        <React.Fragment key={s.n}>
          <div className="step-item">
            <div className="step-dot-wrap">
              <div className={`step-num ${s.n < step ? 'done' : s.n === step ? 'active' : 'future'}`}>
                {s.n < step ? '✓' : s.n}
              </div>
              <div className={`step-label ${s.n === step ? 'active-lbl' : ''}`}>{s.lbl}</div>
            </div>
            {i < arr.length - 1 && (
              <div className={`step-line ${s.n < step ? 'done-line' : ''}`}></div>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div style={{ padding: '40px 20px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        
        {renderStepIndicator()}

        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: '12px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {step === 2 && (
          <div className="onboard-form">
            <div className="ob-header">
              <div className="ob-title">Set up your organization</div>
              <div className="ob-sub">This information appears on your POs, RA Bills, and all documents. You can update it anytime from Settings.</div>
            </div>
            <div className="ob-body">
              <div className="section-divider">Organizational Details</div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Organization Name <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="Kirashi Business Synergies Pvt. Ltd." value={org.name} onChange={e => setOrg({...org, name: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Display / Trade Name</label>
                  <input className="field-input" type="text" placeholder="Kirashi (shown on documents)" value={org.tradeName} onChange={e => setOrg({...org, tradeName: e.target.value})} />
                  <span className="field-hint">Short name used on PO headers and bills</span>
                </div>
                <div className="field">
                  <label className="field-label">Industry <span className="req">*</span></label>
                  <select className="field-select" value={org.industry} onChange={e => setOrg({...org, industry: e.target.value})}>
                    <option>Construction / EPC</option>
                    <option>Roads & Highways</option>
                    <option>Buildings & Real Estate</option>
                    <option>Industrial / Manufacturing</option>
                    <option>Government Infrastructure</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">GSTIN <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="36AXXXX0000X1ZX" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.05em' }} value={org.gstin} onChange={e => setOrg({...org, gstin: e.target.value})} />
                  <span className="field-hint">First 2 digits auto-detect state: 36 = Telangana</span>
                </div>
                <div className="field">
                  <label className="field-label">PAN <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="AXXXXX0000X" style={{ fontFamily: 'var(--font-mono)' }} value={org.pan} onChange={e => setOrg({...org, pan: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">GST Registration Type</label>
                  <select className="field-select" value={org.regType} onChange={e => setOrg({...org, regType: e.target.value})}>
                    <option>Registered Business — Regular</option>
                    <option>Registered Business — Composition</option>
                    <option>Unregistered</option>
                  </select>
                </div>
              </div>

              <div className="section-divider">Regional Settings</div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">State <span className="req">*</span></label>
                  <select className="field-select" value={org.state} onChange={e => setOrg({...org, state: e.target.value})}>
                    <option>Telangana</option>
                    <option>Andhra Pradesh</option>
                    <option>Maharashtra</option>
                    <option>Karnataka</option>
                    <option>Tamil Nadu</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Currency</label>
                  <select className="field-select" value={org.currency} onChange={e => setOrg({...org, currency: e.target.value})}>
                    <option>INR — Indian Rupee (₹)</option>
                    <option>USD — US Dollar</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Financial Year Start</label>
                  <select className="field-select" value={org.fyStart} onChange={e => setOrg({...org, fyStart: e.target.value})}>
                    <option>April (Indian Standard)</option>
                    <option>January</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Default Retention %</label>
                  <input className="field-input" type="number" placeholder="5" value={org.retention} onChange={e => setOrg({...org, retention: e.target.value})} />
                  <span className="field-hint">Applied to all RA Bills unless overridden per WO</span>
                </div>
                <div className="field">
                  <label className="field-label">Default TDS Section</label>
                  <select className="field-select" value={org.tds} onChange={e => setOrg({...org, tds: e.target.value})}>
                    <option>194C — Contractors (2%)</option>
                    <option>194J — Professional (10%)</option>
                    <option>194I — Rent (10%)</option>
                    <option>None</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="ob-footer">
              <span className="ob-progress">Step 2 of 6 — Org Setup</span>
              <div className="ob-btns">
                <button className="btn-sm secondary" onClick={() => navigate('/beta-welcome')}>&larr; Back</button>
                <button className="btn-sm primary" onClick={handleNext}>Save & Continue &rarr;</button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', fontWeight: 500, textAlign: 'center' }}>
              Step 3 — Select your role (determines which modules you see in the tour)
            </p>
            <div className="role-grid">
              {[
                { name: 'Super Admin', icon: '👑', desc: 'Full platform access including settings, user management, and all financial operations.', bullets: ['Approve POs and bills', 'Manage users and roles', 'Access all modules'] },
                { name: 'Project Manager', icon: '📋', desc: 'Manage assigned projects, raise POs, approve indents, track milestones.', bullets: ['Create and track POs', 'Manage work orders', 'View project financials'] },
                { name: 'Site Engineer', icon: '🏗️', desc: 'Field operations — raise indents, record GRN, update milestone progress and MB entries.', bullets: ['Raise material indents', 'Record GRN receipts', 'Update milestone %'] },
                { name: 'Finance', icon: '💰', desc: 'Approve and process RA bills, manage payments, track SCM finance tracker.', bullets: ['Approve RA bills', 'Record payments', 'SCM tracker access'] },
                { name: 'Vendor', icon: '🚚', desc: 'External vendor portal — view assigned POs, track delivery status, upload invoices.', bullets: ['View my POs', 'Dispatch confirmation', 'Upload invoices'] },
                { name: 'Viewer', icon: '👁️', desc: 'Read-only access to dashboards, reports, and project status. Cannot create or modify anything.', bullets: ['View dashboards', 'Download reports', 'No edit access'] }
              ].map(r => (
                <div key={r.name} className={`role-card ${role === r.name ? 'selected' : ''}`} onClick={() => setRole(r.name)}>
                  <div className="role-icon">{r.icon}</div>
                  <div className="role-name">{r.name}</div>
                  <div className="role-desc">{r.desc}</div>
                  <ul className="role-bullets">
                    {r.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px', gap: '12px' }}>
              <button className="btn-sm secondary" style={{ padding: '12px 24px', fontSize: '14px' }} onClick={() => setStep(2)}>&larr; Back</button>
              <button className="btn-sm primary" style={{ padding: '12px 24px', fontSize: '14px' }} onClick={handleNext}>Confirm Role & Continue &rarr;</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="proj-form">
            <div className="proj-header">
              <div className="proj-title">New Project</div>
              <div className="proj-type-tabs">
                {['Construction / EPC', 'Roads / Highways', 'Buildings', 'Industrial'].map(t => (
                  <div key={t} className={`type-tab ${t === 'Construction / EPC' ? 'active' : ''}`}>{t}</div>
                ))}
              </div>
            </div>
            <div className="proj-body">
              <div className="section-divider">Project Identity</div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Project Name <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="e.g. Workshop — Bowrampeta Phase 1" value={project.name} onChange={e => setProject({...project, name: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Project Code <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="Auto: NX-2026-001" style={{ fontFamily: 'var(--font-mono)' }} value={project.code} onChange={e => setProject({...project, code: e.target.value})} />
                  <span className="field-hint">Auto-generated. You can override.</span>
                </div>
                <div className="field">
                  <label className="field-label">Contract Number <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="Tender / contract reference" value={project.contractNo} onChange={e => setProject({...project, contractNo: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Contract Value (₹) <span className="req">*</span></label>
                  <input className="field-input" type="number" placeholder="e.g. 25000000" value={project.contractValue} onChange={e => setProject({...project, contractValue: e.target.value})} />
                  <span className="field-hint">Total awarded contract amount</span>
                </div>
              </div>

              <div className="section-divider">Client & Site</div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Client / Owner Name <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="Who commissioned this project" value={project.clientName} onChange={e => setProject({...project, clientName: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Funding Agency</label>
                  <input className="field-input" type="text" placeholder="NHAI / HMDA / World Bank / State PWD" value={project.fundingAgency} onChange={e => setProject({...project, fundingAgency: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Site Address</label>
                  <input className="field-input" type="text" placeholder="Physical site / chainage location" value={project.siteAddress} onChange={e => setProject({...project, siteAddress: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">State <span className="req">*</span></label>
                  <select className="field-select" value={project.state} onChange={e => setProject({...project, state: e.target.value})}>
                    <option>Telangana</option>
                    <option>Andhra Pradesh</option>
                    <option>Maharashtra</option>
                    <option>Karnataka</option>
                    <option>Tamil Nadu</option>
                  </select>
                </div>
              </div>

              <div className="section-divider">Timeline & Team</div>
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">Start Date <span className="req">*</span></label>
                  <input className="field-input" type="date" value={project.startDate} onChange={e => setProject({...project, startDate: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Expected End Date <span className="req">*</span></label>
                  <input className="field-input" type="date" value={project.endDate} onChange={e => setProject({...project, endDate: e.target.value})} />
                </div>
                <div className="field">
                  <label className="field-label">Project Manager <span className="req">*</span></label>
                  <select className="field-select" value={project.pm} onChange={e => setProject({...project, pm: e.target.value})}>
                    <option>Assign project manager</option>
                    <option>Abhishek Gupta (you)</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Site Engineer</label>
                  <select className="field-select" value={project.se} onChange={e => setProject({...project, se: e.target.value})}>
                    <option>Assign site engineer (optional)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="proj-footer">
              <span style={{ fontSize: '12px', color: 'var(--text-disabled)' }}>Fields marked <span style={{ color: 'var(--accent-red)' }}>*</span> are required</span>
              <div className="ob-btns">
                <button className="btn-sm secondary" onClick={() => setStep(3)}>&larr; Back</button>
                <button className="btn-sm secondary">Skip for now</button>
                <button className="btn-sm primary" onClick={handleNext} disabled={saving}>
                  {saving ? 'Creating...' : 'Create Project \u2192'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div style={{ textAlign: 'center', marginTop: '64px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginBottom: '16px' }}>Preparing your workspace...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Setting up {project.name || 'your project'} for a {role}</p>
            <div style={{ marginTop: '32px' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-default)', borderTopColor: 'var(--brand-amber)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
              <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
