import React, { useRef, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

/* ── Real HMDA ORR Coordinates ── */
const ORR_PACKAGES = [
  {
    id: 'PKG-SW', label: 'Package SW', status: 'Active', contractor: 'Larsen & Toubro',
    color: '#22C55E',
    path: [
      [17.4359, 78.3273], [17.3900, 78.2950], [17.3350, 78.2800],
      [17.2765, 78.3412], [17.2203, 78.4156],
    ]
  },
  {
    id: 'PKG-SE', label: 'Package SE', status: 'Active', contractor: 'NCC Limited',
    color: '#F59E0B',
    path: [
      [17.2203, 78.4156], [17.2365, 78.5234], [17.2700, 78.5800],
      [17.3054, 78.6012], [17.3850, 78.6324],
    ]
  },
  {
    id: 'PKG-NE', label: 'Package NE', status: 'Under Review', contractor: 'Megha Engineering',
    color: '#EF4444',
    path: [
      [17.3850, 78.6324], [17.4400, 78.6100], [17.4856, 78.5812],
      [17.5200, 78.5200], [17.5423, 78.4600], [17.5602, 78.4213],
    ]
  },
  {
    id: 'PKG-NW', label: 'Package NW', status: 'Active', contractor: 'Dilip Buildcon',
    color: '#3B82F6',
    path: [
      [17.5602, 78.4213], [17.5401, 78.3600], [17.5050, 78.3050],
      [17.4700, 78.2900], [17.4359, 78.3273],
    ]
  }
];

const DEPOTS = [
  { name: 'Narsingi Depot',   pos: [17.3800, 78.3400], pkg: 'SW' },
  { name: 'Adibatla Depot',   pos: [17.2100, 78.5300], pkg: 'SE' },
  { name: 'Kompally Depot',   pos: [17.5400, 78.4800], pkg: 'NE' },
  { name: 'Patancheru Depot', pos: [17.5300, 78.2600], pkg: 'NW' },
];

const STREET_VIEW_POINTS = [
  { label: 'Shadnagar Gate',    lat: 17.3603, lng: 78.2876 },
  { label: 'Ghatkesar',         lat: 17.3054, lng: 78.6012 },
  { label: 'Kompally Bypass',   lat: 17.5423, lng: 78.5013 },
  { label: 'Dundigal Section',  lat: 17.4856, lng: 78.2876 },
];

const TILES = {
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics',
  },
  road: {
    label: 'Road',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap, CARTO',
  },
  hybrid: {
    label: 'Hybrid',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
  },
};

/* ── overlay pill style (always dark so it reads over the satellite map) ── */
const OVERLAY = {
  background: 'rgba(8, 12, 22, 0.82)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
};

const GoogleORRMap = () => {
  const [tileMode, setTileMode] = useState('satellite');
  const [svOpen, setSvOpen] = useState(false);
  const [svIdx, setSvIdx] = useState(null);

  const openStreetView = (idx) => {
    const sv = STREET_VIEW_POINTS[idx];
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sv.lat},${sv.lng}&heading=45&pitch=5`;
    window.open(url, '_blank', 'width=960,height=640');
    setSvIdx(idx);
  };

  const tile = TILES[tileMode];
  const depotColorMap = { SW: '#22C55E', SE: '#F59E0B', NE: '#EF4444', NW: '#3B82F6' };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>

      {/* ── Leaflet map ── */}
      <MapContainer
        center={[17.3850, 78.4600]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={true}
      >
        <TileLayer url={tile.url} attribution={tile.attribution} maxZoom={19} />

        {ORR_PACKAGES.map(pkg => (
          <Polyline key={pkg.id} positions={pkg.path} color={pkg.color} weight={5} opacity={0.92}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: '160px', padding: '4px' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '3px', color: '#1a1a2e' }}>{pkg.label}</div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>{pkg.contractor}</div>
                <span style={{
                  background: `${pkg.color}20`, color: pkg.color,
                  border: `1px solid ${pkg.color}50`,
                  padding: '2px 8px', borderRadius: '99px',
                  fontSize: '10px', fontWeight: 700,
                }}>{pkg.status}</span>
              </div>
            </Popup>
          </Polyline>
        ))}

        {DEPOTS.map((d, i) => (
          <CircleMarker
            key={i} center={d.pos} radius={7}
            color="#fff" weight={2}
            fillColor={depotColorMap[d.pkg]} fillOpacity={1}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', padding: '4px', fontSize: '12px', fontWeight: 700, color: '#1a1a2e' }}>
                🏭 {d.name}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ══ TOP-RIGHT: Tile Mode Toggle (compact, 3 pills) ══ */}
      <div style={{
        position: 'absolute', top: '10px', right: '10px', zIndex: 999,
        display: 'flex', borderRadius: '8px', overflow: 'hidden',
        ...OVERLAY,
      }}>
        {Object.entries(TILES).map(([key, t]) => (
          <button
            key={key}
            onClick={() => setTileMode(key)}
            style={{
              padding: '6px 12px',
              fontSize: '0.68rem', fontWeight: 700,
              background: tileMode === key ? 'var(--brand-amber)' : 'transparent',
              color: tileMode === key ? '#fff' : 'rgba(255,255,255,0.55)',
              border: 'none', cursor: 'pointer',
              transition: 'all 180ms',
              fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
              borderRight: key !== 'hybrid' ? '1px solid rgba(255,255,255,0.1)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ BOTTOM-RIGHT: Package Legend (compact) ══ */}
      <div style={{
        position: 'absolute', bottom: '28px', right: '10px', zIndex: 999,
        borderRadius: '10px', padding: '10px 12px',
        ...OVERLAY,
      }}>
        <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.38)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '7px' }}>
          ORR Packages
        </div>
        {ORR_PACKAGES.map(pkg => (
          <div key={pkg.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
            <div style={{ width: '18px', height: '3px', background: pkg.color, borderRadius: '2px', flexShrink: 0 }} />
            <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{pkg.label}</span>
            <span style={{
              fontSize: '0.58rem', fontWeight: 700, color: pkg.color,
              background: `${pkg.color}22`, padding: '1px 6px',
              borderRadius: '99px', border: `1px solid ${pkg.color}40`,
              marginLeft: 'auto',
            }}>{pkg.status}</span>
          </div>
        ))}
      </div>

      {/* ══ BOTTOM-LEFT: Street View — collapsible panel ══ */}
      <div style={{
        position: 'absolute', bottom: '28px', left: '10px', zIndex: 999,
        borderRadius: '10px', minWidth: '180px',
        ...OVERLAY,
        overflow: 'hidden',
      }}>
        {/* Header / toggle */}
        <button
          onClick={() => setSvOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '8px 12px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.75)', gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <Navigation size={10} /> Street View
          </div>
          {svOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>

        {/* Expandable buttons */}
        {svOpen && (
          <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {STREET_VIEW_POINTS.map((sv, i) => (
              <button
                key={i}
                onClick={() => openStreetView(i)}
                style={{
                  padding: '5px 10px', fontSize: '0.68rem', fontWeight: 600,
                  background: svIdx === i ? 'rgba(255,122,0,0.22)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${svIdx === i ? 'rgba(255,122,0,0.45)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '6px',
                  color: svIdx === i ? '#FF9A3C' : 'rgba(255,255,255,0.65)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 160ms',
                  fontFamily: 'Inter, sans-serif',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,122,0,0.18)'; e.currentTarget.style.color = '#FFB067'; }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = svIdx === i ? 'rgba(255,122,0,0.22)' : 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = svIdx === i ? '#FF9A3C' : 'rgba(255,255,255,0.65)';
                }}
              >
                <ExternalLink size={9} style={{ flexShrink: 0 }} />
                {sv.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleORRMap;
