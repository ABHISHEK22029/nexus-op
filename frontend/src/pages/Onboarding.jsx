import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, MapPin, Calendar, IndianRupee, Users, CheckCircle,
  ChevronRight, ChevronLeft, Loader2, Sparkles, Layers, AlertCircle
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const STEPS = [
  { label: 'Organization',  icon: Building2,  desc: 'Set up your company' },
  { label: 'First Project', icon: Layers,     desc: 'Create your first project' },
  { label: 'Project Details', icon: MapPin,   desc: 'Location & financials' },
  { label: 'Team',          icon: Users,      desc: 'Invite team members' },
];

const PROJECT_TYPES = ['Road & Highway','Building Construction','Bridge','Metro Rail','Water & Sewage','Power Plant','Industrial','Other'];
const STATES = ['Andhra Pradesh','Gujarat','Karnataka','Maharashtra','Madhya Pradesh','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','West Bengal','Other'];

const inputStyle = {
  width: '100%', padding: '12px 14px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 10, fontSize: '0.875rem',
  color: 'var(--text-primary)', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 };

const ThemeInput = ({ ...props }) => {
  const [f, setF] = useState(false);
  return (
    <input style={{ ...inputStyle, borderColor: f ? 'var(--brand-amber)' : 'var(--border-default)', boxShadow: f ? '0 0 0 3px var(--brand-amber-muted)' : 'none' }}
      onFocus={() => setF(true)} onBlur={() => setF(false)} {...props}/>
  );
};
const ThemeSelect = ({ children, ...props }) => {
  const [f, setF] = useState(false);
  return (
    <select style={{ ...inputStyle, cursor: 'pointer', borderColor: f ? 'var(--brand-amber)' : 'var(--border-default)', boxShadow: f ? '0 0 0 3px var(--brand-amber-muted)' : 'none' }}
      onFocus={() => setF(true)} onBlur={() => setF(false)} {...props}>{children}</select>
  );
};

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const { fetchProjects } = useProject();

  const [org, setOrg] = useState({ name: '', cin: '', gst: '', address: '', city: '', state: '' });
  const [project, setProject] = useState({ name: '', code: '', type: '', client: '', contractValue: '', startDate: '', endDate: '' });
  const [details, setDetails] = useState({ location: '', state: '', latitude: '', longitude: '', description: '' });
  const [team, setTeam] = useState([{ name: '', email: '', role: 'PROJECT_MANAGER' }]);

  const setO = (k, v) => setOrg(o => ({ ...o, [k]: v }));
  const setP = (k, v) => setProject(p => ({ ...p, [k]: v }));
  const setD = (k, v) => setDetails(d => ({ ...d, [k]: v }));

  const addTeamMember = () => setTeam(t => [...t, { name: '', email: '', role: 'SITE_ENGINEER' }]);
  const updateMember = (i, k, v) => setTeam(t => t.map((m, idx) => idx === i ? { ...m, [k]: v } : m));

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem('nexus_token');
      const headers = { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) };

      // Create project in Node DB
      const res = await fetch(`${API}/projects`, {
        method: 'POST', headers,
        body: JSON.stringify({
          name: project.name,
          clientName: project.client || 'Internal',
          type: project.type || 'construction',
          startDate: project.startDate || null,
          endDate: project.endDate || null,
          status: 'Active',
        }),
      });

      if (!res.ok) throw new Error('Failed to create project');

      // Refresh project context so it shows up in dashboard
      fetchProjects();

      setDone(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
            background: 'hsl(158,64%,52%,0.15)', border: '2px solid var(--accent-emerald)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'pulse-amber 1s ease',
          }}>
            <CheckCircle size={36} style={{ color: 'var(--accent-emerald)' }}/>
          </div>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 700 }}>You're all set!</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Taking you to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '48px 24px' }}>
      {/* Ambient */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-5%', right: '0', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, var(--brand-amber-muted) 0%, transparent 70%)', animation: 'float-blob 14s ease-in-out infinite' }}/>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '6px 16px', borderRadius: 999, background: 'var(--brand-amber-muted)', border: '1px solid var(--brand-amber)' }}>
            <Sparkles size={14} style={{ color: 'var(--brand-amber)' }}/>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--brand-amber)' }}>Welcome to Maks Ops</span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Let's get you set up
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 8 }}>
            Takes about 2 minutes. You can update everything later from Settings.
          </p>
          {error && (
            <div style={{ marginTop: 16, padding: '12px', background: 'hsl(0,80%,50%,0.1)', color: 'hsl(0,80%,60%)', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>

        {/* Step Progress */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36, gap: 0 }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === i;
            const isDone = step > i;
            return (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDone ? 'var(--accent-emerald)' : isActive ? 'var(--brand-amber)' : 'var(--bg-elevated)',
                    border: `2px solid ${isDone ? 'var(--accent-emerald)' : isActive ? 'var(--brand-amber)' : 'var(--border-default)'}`,
                    color: isDone || isActive ? 'white' : 'var(--text-muted)',
                    transition: 'all 300ms ease',
                  }}>
                    {isDone ? <CheckCircle size={18}/> : <Icon size={18}/>}
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: isActive ? 'var(--brand-amber)' : isDone ? 'var(--accent-emerald)' : 'var(--text-muted)', textAlign: 'center' }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ height: 2, flex: 1, background: step > i ? 'var(--accent-emerald)' : 'var(--border-subtle)', marginBottom: 22, transition: 'background 300ms ease' }}/>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 36, boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{STEPS[step].label}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 28 }}>{STEPS[step].desc}</p>

          {/* ── STEP 0: Organization ── */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Company / Organization Name <span style={{ color: 'var(--accent-red)' }}>*</span></label>
                  <ThemeInput value={org.name} onChange={e => setO('name', e.target.value)} placeholder="ABC Infrastructure Pvt Ltd"/>
                </div>
                <div>
                  <label style={labelStyle}>CIN Number</label>
                  <ThemeInput value={org.cin} onChange={e => setO('cin', e.target.value)} placeholder="U45201MH2010PTC123456"/>
                </div>
                <div>
                  <label style={labelStyle}>GST Number</label>
                  <ThemeInput value={org.gst} onChange={e => setO('gst', e.target.value)} placeholder="27AABCU9603R1ZX"/>
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <ThemeInput value={org.city} onChange={e => setO('city', e.target.value)} placeholder="Mumbai"/>
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <ThemeSelect value={org.state} onChange={e => setO('state', e.target.value)}>
                    <option value="">Select state...</option>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </ThemeSelect>
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, fontSize: '0.78rem', color: 'var(--text-muted)', borderLeft: '3px solid var(--brand-amber)' }}>
                You can complete your full organization profile anytime in <strong>Settings → Organization</strong>
              </div>
            </div>
          )}

          {/* ── STEP 1: First Project ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Project Name <span style={{ color: 'var(--accent-red)' }}>*</span></label>
                  <ThemeInput value={project.name} onChange={e => setP('name', e.target.value)} placeholder="Hyderabad Metro Rail Phase 2"/>
                </div>
                <div>
                  <label style={labelStyle}>Project Code</label>
                  <ThemeInput value={project.code} onChange={e => setP('code', e.target.value)} placeholder="HMR-P2-2024"/>
                </div>
                <div>
                  <label style={labelStyle}>Project Type</label>
                  <ThemeSelect value={project.type} onChange={e => setP('type', e.target.value)}>
                    <option value="">Select type...</option>
                    {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </ThemeSelect>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Client / Owner Name</label>
                  <ThemeInput value={project.client} onChange={e => setP('client', e.target.value)} placeholder="Hyderabad Metro Rail Ltd"/>
                </div>
                <div>
                  <label style={labelStyle}>Contract Value (₹)</label>
                  <ThemeInput type="number" value={project.contractValue} onChange={e => setP('contractValue', e.target.value)} placeholder="2500000000"/>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Project Details ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <ThemeInput type="date" value={project.startDate} onChange={e => setP('startDate', e.target.value)}/>
                </div>
                <div>
                  <label style={labelStyle}>End Date (Planned)</label>
                  <ThemeInput type="date" value={project.endDate} onChange={e => setP('endDate', e.target.value)}/>
                </div>
                <div>
                  <label style={labelStyle}>Site Location</label>
                  <ThemeInput value={details.location} onChange={e => setD('location', e.target.value)} placeholder="Hitec City, Hyderabad"/>
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <ThemeSelect value={details.state} onChange={e => setD('state', e.target.value)}>
                    <option value="">Select state...</option>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </ThemeSelect>
                </div>
                <div>
                  <label style={labelStyle}>Latitude</label>
                  <ThemeInput type="number" step="any" value={details.latitude} onChange={e => setD('latitude', e.target.value)} placeholder="17.4415"/>
                </div>
                <div>
                  <label style={labelStyle}>Longitude</label>
                  <ThemeInput type="number" step="any" value={details.longitude} onChange={e => setD('longitude', e.target.value)} placeholder="78.3804"/>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={labelStyle}>Project Description</label>
                  <textarea value={details.description} onChange={e => setD('description', e.target.value)} placeholder="Brief description of scope and objectives..."
                    style={{ ...inputStyle, height: 80, resize: 'vertical' }}/>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Team ── */}
          {step === 3 && (
            <div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                Invite team members to this project. They'll get an email to set their password.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {team.map((m, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                    <div>
                      <label style={labelStyle}>Name</label>
                      <ThemeInput value={m.name} onChange={e => updateMember(i, 'name', e.target.value)} placeholder="Rajesh Kumar"/>
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <ThemeInput type="email" value={m.email} onChange={e => updateMember(i, 'email', e.target.value)} placeholder="rajesh@company.com"/>
                    </div>
                    <div>
                      <label style={labelStyle}>Role</label>
                      <ThemeSelect value={m.role} onChange={e => updateMember(i, 'role', e.target.value)}>
                        <option value="PROJECT_MANAGER">Project Manager</option>
                        <option value="SITE_ENGINEER">Site Engineer</option>
                        <option value="FINANCE">Finance</option>
                        <option value="VIEWER">Viewer</option>
                      </ThemeSelect>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addTeamMember} style={{
                  padding: '9px 16px', borderRadius: 8, border: '1px dashed var(--border-default)',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: '0.82rem', marginTop: 4, transition: 'all 150ms ease',
                }}>
                  + Add another member
                </button>
              </div>
              <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, fontSize: '0.78rem', color: 'var(--text-muted)', borderLeft: '3px solid var(--brand-amber)' }}>
                Skip this step if you want to invite people later from <strong>Settings → Team</strong>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
            borderRadius: 10, border: '1px solid var(--border-default)', background: 'transparent',
            color: step === 0 ? 'var(--text-disabled)' : 'var(--text-secondary)', cursor: step === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}>
            <ChevronLeft size={16}/> Back
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            {step < 3 && (
              <button onClick={() => setStep(s => s + 1)} style={{
                padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border-default)',
                background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem',
              }}>
                Skip this step
              </button>
            )}
            {step < 3 ? (
              <button onClick={() => setStep(s => s + 1)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px',
                borderRadius: 10, border: 'none', background: 'var(--brand-amber)',
                color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem',
                boxShadow: 'var(--shadow-amber)',
              }}>
                Continue <ChevronRight size={16}/>
              </button>
            ) : (
              <button onClick={handleFinish} disabled={saving} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px',
                borderRadius: 10, border: 'none', background: 'var(--brand-amber)',
                color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem',
                boxShadow: 'var(--shadow-amber)',
              }}>
                {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> : <CheckCircle size={16}/>}
                {saving ? 'Creating...' : 'Go to Dashboard'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
