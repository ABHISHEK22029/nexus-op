import React, { useEffect } from 'react';
import { 
  FolderOpen, ShoppingCart, Package, BarChart2,
  Shield, Box, Settings, Sun, ArrowRight,
  ChevronDown, ShieldCheck
} from 'lucide-react';

const KirashiPortal = () => {

  // Check for saved preference on load
  useEffect(() => {
    const savedWorkspace = localStorage.getItem('kirashi_workspace_pref');
    if (savedWorkspace === 'nexus') {
      window.location.href = 'https://nexus-op-sn4d.vercel.app/';
    } else if (savedWorkspace === 'fabrication') {
      window.location.href = 'https://kirashibusinesssynergies.netlify.app/';
    }
  }, []);

  const handleSelectWorkspace = (workspace, url) => {
    localStorage.setItem('kirashi_workspace_pref', workspace);
    window.location.href = url;
  };

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw',
      display: 'flex', 
      flexDirection: 'column', 
      backgroundColor: '#FAFBFC', 
      fontFamily: '"Inter", sans-serif',
      position: 'relative',
      overflow: 'hidden', 
      boxSizing: 'border-box'
    }}>
      
      {/* Background Gradients */}
      <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(249, 115, 22, 0.05) 0%, rgba(250, 251, 252, 0) 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '55vw', height: '55vw', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, rgba(250, 251, 252, 0) 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)', backgroundSize: '32px 32px', opacity: 0.4, pointerEvents: 'none', zIndex: 0 }} />

      {/* --- Navbar --- */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '16px 40px',
        position: 'relative',
        zIndex: 10,
        backgroundColor: 'rgba(250, 251, 252, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.6)'
      }}>
        <div style={{ flex: 1 }} />

        {/* Centered Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 600, color: '#F97316', letterSpacing: '2px', lineHeight: 1.1, fontFamily: 'serif' }}>KIRASHI</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
             <div style={{ height: '1px', width: '16px', backgroundColor: '#9CA3AF' }} />
             <span style={{ fontSize: '0.5rem', fontWeight: 700, color: '#6B7280', letterSpacing: '3px' }}>BUSINESS SYNERGIES</span>
             <div style={{ height: '1px', width: '16px', backgroundColor: '#9CA3AF' }} />
          </div>
        </div>

        {/* Right User Profile */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '6px 12px', borderRadius: '99px', transition: 'background-color 0.2s', ':hover': { backgroundColor: 'rgba(226, 232, 240, 0.5)' } }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#FFEDD5', color: '#EA580C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>A</div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Abhishek Gupta</span>
            <ChevronDown size={14} color="#6B7280" />
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '0 24px',
        position: 'relative',
        zIndex: 10
      }}>
        
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px', letterSpacing: '-0.02em', textShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            Choose your workspace
          </h1>
          <p style={{ fontSize: '1rem', color: '#64748B', fontWeight: 500, margin: 0 }}>
            Select the platform you'd like to access
          </p>
        </div>

        {/* --- Cards Container --- */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '24px', maxWidth: '1000px', width: '100%', height: '420px' }}>
          
          {/* Nexus-OP Card (Entire Tile is Clickable) */}
          <div 
            onClick={() => handleSelectWorkspace('nexus', 'https://nexus-op-sn4d.vercel.app/')}
            style={{ 
              flex: 1, 
              backgroundColor: 'rgba(255, 255, 255, 0.7)', 
              borderRadius: '24px', 
              overflow: 'hidden', 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column',
              boxShadow: '0 20px 40px -20px rgba(249,115,22,0.15), inset 0 0 0 1px rgba(255,255,255,0.6)',
              border: '1px solid rgba(249,115,22,0.1)',
              backdropFilter: 'blur(20px)',
              cursor: 'pointer',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 25px 50px -20px rgba(249,115,22,0.2), inset 0 0 0 1px rgba(255,255,255,0.8)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 20px 40px -20px rgba(249,115,22,0.15), inset 0 0 0 1px rgba(255,255,255,0.6)'; }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,249,245,0.7) 100%)', zIndex: 0 }} />

            <div style={{ padding: '32px', flex: 1, zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{ width: '56px', height: '56px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <svg viewBox="0 0 100 100" style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0 }}>
                     <polygon points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" fill="rgba(249,115,22,0.05)" stroke="#F97316" strokeWidth="6" strokeLinejoin="round" />
                   </svg>
                   <span style={{ fontSize: '24px', fontWeight: 900, color: '#F97316', zIndex: 1, marginTop: '2px' }}>N</span>
                </div>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>NEXUS-OP</h2>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#EA580C', margin: '2px 0 0 0' }}>ERP Operations Suite</p>
                </div>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, maxWidth: '240px', marginBottom: '24px' }}>
                Manage projects, procurement, inventory, BOQ, measurements and RA bills efficiently.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                   <FolderOpen size={18} color="#F97316" strokeWidth={2} /> Projects & BOQ
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                   <ShoppingCart size={18} color="#F97316" strokeWidth={2} /> Procurement
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                   <Package size={18} color="#F97316" strokeWidth={2} /> Inventory
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                   <BarChart2 size={18} color="#F97316" strokeWidth={2} /> Reports & Analytics
                </div>
              </div>

              {/* Mini Abstract UI Illustration */}
              <div style={{ position: 'absolute', right: '-10px', top: '110px', width: '200px', height: '200px', pointerEvents: 'none' }}>
                 <div style={{ position: 'absolute', top: 0, right: 20, width: '160px', height: '90px', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(249,115,22,0.12)', border: '1px solid #FFEDD5', padding: '12px' }}>
                   <div style={{ width: '30px', height: '4px', backgroundColor: '#E2E8F0', borderRadius: '4px', marginBottom: '12px' }} />
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div>
                       <div style={{ fontSize: '0.5rem', color: '#94A3B8', fontWeight: 600 }}>Total Projects</div>
                       <div style={{ fontSize: '1.1rem', color: '#0F172A', fontWeight: 800 }}>128</div>
                     </div>
                     <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '4px solid #FED7AA', borderTopColor: '#F97316' }} />
                   </div>
                 </div>
                 <div style={{ position: 'absolute', top: 80, right: 40, width: '140px', height: '80px', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(249,115,22,0.12)', border: '1px solid #FFEDD5', padding: '10px', display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                    <div style={{ flex: 1, backgroundColor: '#F97316', height: '30%', borderRadius: '2px 2px 0 0' }} />
                    <div style={{ flex: 1, backgroundColor: '#FB923C', height: '50%', borderRadius: '2px 2px 0 0' }} />
                    <div style={{ flex: 1, backgroundColor: '#FDBA74', height: '70%', borderRadius: '2px 2px 0 0' }} />
                    <div style={{ flex: 1, backgroundColor: '#F97316', height: '40%', borderRadius: '2px 2px 0 0' }} />
                    <div style={{ flex: 1, backgroundColor: '#FB923C', height: '90%', borderRadius: '2px 2px 0 0' }} />
                 </div>
              </div>
            </div>

            {/* Solid Orange Button */}
            <div style={{ 
              padding: '20px', 
              backgroundColor: '#F97316', 
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
              color: '#FFF', fontWeight: 700, fontSize: '0.9rem',
              zIndex: 2
            }}>
              Open Nexus-Op <ArrowRight size={16} color="#FFF" />
            </div>
          </div>

          {/* Fabrication Card (Entire Tile is Clickable) */}
          <div 
            onClick={() => handleSelectWorkspace('fabrication', 'https://kirashibusinesssynergies.netlify.app/')}
            style={{ 
              flex: 1, 
              backgroundColor: 'rgba(255, 255, 255, 0.7)', 
              borderRadius: '24px', 
              overflow: 'hidden', 
              position: 'relative', 
              display: 'flex', 
              flexDirection: 'column',
              boxShadow: '0 20px 40px -20px rgba(59,130,246,0.15), inset 0 0 0 1px rgba(255,255,255,0.6)',
              border: '1px solid rgba(59,130,246,0.1)',
              backdropFilter: 'blur(20px)',
              cursor: 'pointer',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 25px 50px -20px rgba(59,130,246,0.2), inset 0 0 0 1px rgba(255,255,255,0.8)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 20px 40px -20px rgba(59,130,246,0.15), inset 0 0 0 1px rgba(255,255,255,0.6)'; }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(245,248,255,0.7) 100%)', zIndex: 0 }} />

            <div style={{ padding: '32px', flex: 1, zIndex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{ width: '56px', height: '56px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <div style={{ width: '44px', height: '44px', backgroundColor: '#EFF6FF', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-5deg)' }}>
                     <svg width="26" height="26" viewBox="0 0 24 24" fill="#2563EB" xmlns="http://www.w3.org/2000/svg">
                       <path d="M2 20h20v2H2v-2zm2-2h4V8l4 3v7h4V4l4 3v11h4V2L2 18z"/>
                     </svg>
                   </div>
                </div>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>FABRICATION</h2>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563EB', margin: '2px 0 0 0' }}>Fabrication & Engineering</p>
                </div>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, maxWidth: '240px', marginBottom: '24px' }}>
                Explore our capabilities, products, services, and innovative engineering solutions.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  <div style={{ padding: '4px', backgroundColor: '#EFF6FF', borderRadius: '6px' }}><Shield size={16} color="#2563EB" strokeWidth={2.5} /></div> Our Capabilities
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  <div style={{ padding: '4px', backgroundColor: '#EFF6FF', borderRadius: '6px' }}><Box size={16} color="#2563EB" strokeWidth={2.5} /></div> Products
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  <div style={{ padding: '4px', backgroundColor: '#EFF6FF', borderRadius: '6px' }}><Settings size={16} color="#2563EB" strokeWidth={2.5} /></div> Services
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  <div style={{ padding: '4px', backgroundColor: '#EFF6FF', borderRadius: '6px' }}><Sun size={16} color="#2563EB" strokeWidth={2.5} /></div> Solar Solutions
                </div>
              </div>

              {/* Aesthetic Blueprint Illustration */}
              <div style={{ position: 'absolute', right: '-10px', bottom: '0px', width: '220px', height: '220px', pointerEvents: 'none' }}>
                 <svg width="100%" height="100%" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                   <g stroke="#3B82F6" strokeWidth="1.5" fill="none" opacity="0.3">
                     <path d="M40,160 L170,95 L170,35 L40,100 Z" fill="rgba(59,130,246,0.05)" />
                     <path d="M40,160 L40,220 L170,155 L170,95 Z" />
                     <path d="M10,175 L140,110 L140,50 L10,115 Z" fill="rgba(59,130,246,0.1)"/>
                     <path d="M10,175 L10,235 L140,170 L140,110 Z" />
                     <line x1="40" y1="100" x2="40" y2="160" />
                     <line x1="170" y1="35" x2="170" y2="95" />
                     <line x1="10" y1="115" x2="10" y2="175" />
                     <line x1="140" y1="50" x2="140" y2="110" />
                     <line x1="40" y1="120" x2="170" y2="55" />
                     <line x1="40" y1="140" x2="170" y2="75" />
                   </g>
                 </svg>
              </div>
            </div>

            <div style={{ 
              padding: '20px', 
              backgroundColor: 'rgba(255,255,255,0.8)', 
              borderTop: '1px solid rgba(59,130,246,0.15)', 
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
              color: '#2563EB', fontWeight: 700, fontSize: '0.9rem',
              backdropFilter: 'blur(10px)',
              zIndex: 2
            }}>
              Visit Fabrication Website <ArrowRight size={16} />
            </div>
          </div>

        </div>
      </main>

      {/* --- Bottom Footer --- */}
      <footer style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center', 
        padding: '16px 40px', 
        zIndex: 10,
        backgroundColor: 'rgba(250, 251, 252, 0.5)',
        borderTop: '1px solid rgba(226, 232, 240, 0.4)'
      }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} color="#94A3B8" />
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Secure. Reliable. Built for Performance.</span>
        </div>

        <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 500 }}>
          © 2026 Kirashi Business Synergies. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default KirashiPortal;
