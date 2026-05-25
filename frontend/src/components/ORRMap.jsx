import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Hyderabad Center Approximation
const center = [17.3850, 78.4867];

const ORRMap = () => {
  // Approximate ORR Ring Arcs (Coordinates are mocked for visual demo effect around hyd)
  const pkg1 = [
    [17.3850, 78.2867], [17.3000, 78.3000], [17.2500, 78.3867]
  ]; // SW (Green)
  const pkg2 = [
    [17.2500, 78.4867], [17.2800, 78.6000], [17.3850, 78.6867]
  ]; // SE (Amber)
  const pkg3 = [
    [17.3850, 78.6867], [17.4800, 78.6000], [17.5500, 78.4867]
  ]; // NE (Red)
  const pkg4 = [
    [17.5500, 78.4867], [17.4800, 78.3000], [17.3850, 78.2867]
  ]; // NW (Green)

  const depots = [
    { name: 'Narsingi Depot', pos: [17.3800, 78.3400] },
    { name: 'Adibatla Depot', pos: [17.2100, 78.5300] },
    { name: 'Kompally Depot', pos: [17.5400, 78.4800] },
    { name: 'Patancheru Depot', pos: [17.5300, 78.2600] },
  ];

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-white/10 z-0">
      <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%', background: '#111113' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        
        {/* PKG 1 SW */}
        <Polyline positions={pkg1} color="#10b981" weight={5} />
        {/* PKG 2 SE */}
        <Polyline positions={pkg2} color="#f59e0b" weight={5} />
        {/* PKG 3 NE */}
        <Polyline positions={pkg3} color="#ef4444" weight={5} />
        {/* PKG 4 NW */}
        <Polyline positions={pkg4} color="#10b981" weight={5} />

        {depots.map((d, i) => (
          <CircleMarker center={d.pos} radius={6} color="#3b82f6" fillColor="#3b82f6" fillOpacity={0.8} key={i}>
            <Popup className="text-black font-semibold">{d.name}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

export default ORRMap;
