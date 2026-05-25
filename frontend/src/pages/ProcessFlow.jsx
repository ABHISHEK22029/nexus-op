import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges,
  Panel
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import {
  Route, X, Building2, ShoppingCart, Receipt, ChevronRight,
  Package, TrendingUp, RefreshCw, Info, Workflow
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/* ── Dagre layout ── */
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges) => {
  dagreGraph.setGraph({ rankdir: 'LR', ranksep: 90, nodesep: 40 });
  nodes.forEach(n => dagreGraph.setNode(n.id, { width: 220, height: 70 }));
  edges.forEach(e => dagreGraph.setEdge(e.source, e.target));
  dagre.layout(dagreGraph);
  nodes.forEach(n => {
    const pos = dagreGraph.node(n.id);
    n.targetPosition = 'left';
    n.sourcePosition = 'right';
    n.position = { x: pos.x - 110, y: pos.y - 35 };
  });
  return { nodes, edges };
};

/* ── Node type configs ── */
const NODE_TYPES = {
  vendor: { color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', darkBg: '#1e2a42', darkBorder: '#3B82F6', label: 'Vendor', icon: '🏢' },
  po:     { color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', darkBg: '#2a2010', darkBorder: '#F59E0B', label: 'Purchase Order', icon: '📦' },
  bill:   { color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', darkBg: '#0d2a1e', darkBorder: '#10B981', label: 'RA Bill', icon: '📄' },
};

/* ── Custom node renderer via inline style ── */
const makeNodeStyle = (type, isDark) => {
  const cfg = NODE_TYPES[type];
  return {
    background: isDark ? cfg.darkBg : cfg.bg,
    color: isDark ? '#fff' : '#1a1a2e',
    border: `1.5px solid ${isDark ? cfg.darkBorder : cfg.border}`,
    borderRadius: '12px',
    padding: '10px 16px',
    width: 220,
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    boxShadow: isDark
      ? `0 2px 12px ${cfg.color}22`
      : `0 2px 10px ${cfg.color}18`,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  };
};

/* ── Detail Panel ── */
const DetailPanel = ({ data, onClose, isDark }) => {
  const typeMap = { Vendor: NODE_TYPES.vendor, 'Purchase Order': NODE_TYPES.po, 'RA Bill': NODE_TYPES.bill };
  const cfg = typeMap[data.type] || NODE_TYPES.vendor;

  return (
    <div style={{
      width: '300px', height: '100%',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border-subtle)',
      padding: '24px',
      display: 'flex', flexDirection: 'column',
      animation: 'slide-in-right 200ms ease',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
          }}>
            {cfg.icon}
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {data.type}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Node Details
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '6px' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <X size={16} />
        </button>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {Object.entries(data).map(([key, value]) => (
          <div key={key} style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '12px 14px',
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '4px' }}>
              {key}
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
              {String(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Accent line */}
      <div style={{
        marginTop: 'auto', paddingTop: '20px',
        display: 'flex', alignItems: 'center', gap: '6px',
        fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic',
      }}>
        <Info size={11} />
        Click any node in the graph to inspect it
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════
   PROCESS FLOW PAGE
   ══════════════════════════════════════════════════════════ */
const ProcessFlow = () => {
  const { isDark } = useTheme();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeData, setSelectedNodeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ vendors: 0, pos: 0, bills: 0 });

  const onNodesChange = useCallback(c => setNodes(n => applyNodeChanges(c, n)), []);
  const onEdgesChange = useCallback(c => setEdges(e => applyEdgeChanges(c, e)), []);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeData(node.data.details);
  }, []);

  const buildGraph = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, poRes, bRes] = await Promise.all([
        fetch('http://localhost:5000/vendors').then(r => r.json()),
        fetch('http://localhost:5000/po').then(r => r.json()),
        fetch('http://localhost:5000/bills').then(r => r.json()),
      ]);

      setStats({ vendors: vRes.length, pos: poRes.length, bills: bRes.length });

      const newNodes = [];
      const newEdges = [];

      /* Vendor nodes */
      vRes.forEach(v => {
        newNodes.push({
          id: `v-${v.id}`,
          type: 'input',
          data: {
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏢</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
              </div>
            ),
            details: { type: 'Vendor', name: v.name, sector: v.type || '—', id: `V-${v.id}` }
          },
          style: makeNodeStyle('vendor', isDark),
        });
      });

      /* PO nodes */
      poRes.forEach(po => {
        newNodes.push({
          id: `po-${po.id}`,
          data: {
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📦</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>PO-{po.id}: {po.itemName}</span>
              </div>
            ),
            details: { type: 'Purchase Order', id: `PO-${String(po.id).padStart(4,'0')}`, item: po.itemName, qty: po.quantity, status: po.status }
          },
          style: makeNodeStyle('po', isDark),
        });
        newEdges.push({
          id: `e-v${po.vendorId}-po${po.id}`,
          source: `v-${po.vendorId}`, target: `po-${po.id}`,
          type: 'smoothstep', animated: true,
          style: { stroke: '#F59E0B', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#F59E0B' },
        });
      });

      /* Bill nodes */
      bRes.forEach(bill => {
        newNodes.push({
          id: `b-${bill.id}`,
          type: 'output',
          data: {
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📄</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>RA Bill-{bill.id}</span>
              </div>
            ),
            details: { type: 'RA Bill', id: `BILL-${String(bill.id).padStart(4,'0')}`, gross: `₹${Number(bill.grossAmount||0).toLocaleString('en-IN')}`, net: `₹${Number(bill.netAmount||0).toLocaleString('en-IN')}`, status: bill.status || 'Draft' }
          },
          style: makeNodeStyle('bill', isDark),
        });
        newEdges.push({
          id: `e-po${bill.poId}-b${bill.id}`,
          source: `po-${bill.poId}`, target: `b-${bill.id}`,
          type: 'smoothstep',
          animated: poRes.find(p => p.id === bill.poId)?.status === 'Delivered',
          style: { stroke: '#10B981', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed', color: '#10B981' },
        });
      });

      const { nodes: ln, edges: le } = getLayoutedElements(newNodes, newEdges);
      setNodes(ln);
      setEdges(le);
    } catch (err) {
      console.error('Flow load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isDark]);

  useEffect(() => { buildGraph(); }, [buildGraph]);

  /* Re-style nodes when theme changes */
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      const type = n.id.startsWith('v-') ? 'vendor' : n.id.startsWith('po-') ? 'po' : 'bill';
      return { ...n, style: makeNodeStyle(type, isDark) };
    }));
  }, [isDark]);

  const bgColor = isDark ? '#0D1320' : 'hsl(38,28%,95%)';
  const gridColor = isDark ? '#ffffff12' : '#00000010';
  const miniMapBg = isDark ? '#1a1f2e' : '#fff';

  return (
    <div style={{
      height: 'calc(100vh - 8rem)',
      display: 'flex', flexDirection: 'column',
      animation: 'fade-in 0.4s ease',
      gap: 0,
    }}>

      {/* ── Page Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 0 16px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'hsl(240,70%,60%,0.12)', border: '1px solid hsl(240,70%,60%,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Workflow size={20} style={{ color: 'hsl(240,70%,60%)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Process Flow Graph
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Dagre auto-layout · Vendor → PO → Bill chain · Click any node to inspect
            </p>
          </div>
        </div>

        {/* Stats pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {[
            { icon: '🏢', label: 'Vendors', value: stats.vendors, color: '#3B82F6' },
            { icon: '📦', label: 'POs', value: stats.pos, color: '#F59E0B' },
            { icon: '📄', label: 'Bills', value: stats.bills, color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '6px 14px', borderRadius: '99px',
              background: `${s.color}10`, border: `1px solid ${s.color}30`,
              fontSize: '0.78rem', fontWeight: 700,
            }}>
              <span>{s.icon}</span>
              <span style={{ color: s.color }}>{s.value}</span>
              <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
          ))}
          <button
            onClick={buildGraph}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '8px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', transition: 'all 180ms',
              fontFamily: 'var(--font-body)',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Flow Canvas + Detail Panel ── */}
      <div style={{
        flex: 1, display: 'flex', borderRadius: '20px', overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* ReactFlow canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          {loading ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: bgColor, color: 'var(--text-muted)', gap: '14px',
            }}>
              <div style={{ fontSize: '2.5rem', animation: 'spin 2s linear infinite' }}>⚙️</div>
              <p style={{ fontSize: '0.88rem' }}>Building flow graph from live data…</p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              minZoom={0.08}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              style={{ background: bgColor }}
            >
              <Background color={gridColor} gap={24} size={1} />
              <Controls
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  boxShadow: 'var(--shadow-sm)',
                  overflow: 'hidden',
                }}
              />
              <MiniMap
                style={{
                  background: miniMapBg,
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                }}
                nodeColor={n => {
                  if (n.id.startsWith('v-')) return '#3B82F6';
                  if (n.id.startsWith('po-')) return '#F59E0B';
                  return '#10B981';
                }}
                maskColor={isDark ? 'rgba(0,0,0,0.4)' : 'rgba(220,210,200,0.35)'}
              />

              {/* Legend panel */}
              <Panel position="top-left">
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: '12px', padding: '12px 16px',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Node Types
                  </div>
                  {Object.entries(NODE_TYPES).map(([key, cfg]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: cfg.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{cfg.icon} {cfg.label}</span>
                    </div>
                  ))}
                  {nodes.length === 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
                      No data yet — add vendors and POs
                    </div>
                  )}
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {/* Detail Panel */}
        {selectedNodeData && (
          <DetailPanel data={selectedNodeData} onClose={() => setSelectedNodeData(null)} isDark={isDark} />
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slide-in-right { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default ProcessFlow;
