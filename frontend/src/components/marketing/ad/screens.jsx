import React from 'react';
import { LayoutDashboard, Megaphone, ClipboardList, ShoppingCart, Package, Factory, IndianRupee, Search, Bell } from 'lucide-react';
import { MoMark } from '../film/shell/marks';
import { CUSTOMER, PRODUCT, QTY, STOCK } from '../data/transaction';
import { Ring } from './parts';
import { box, IDS } from './util';

/* ══════════════════════════════════════════════════════════════════════
   The screens the ad floats on its dark stage: Maks Ops itself (the dark
   rail and a light page, as the app is), the customer's browser, and the
   order, which several acts draw in turn.
   ══════════════════════════════════════════════════════════════════════ */

const RAIL = [
  ['home', LayoutDashboard], ['marketing', Megaphone], ['sales', ClipboardList], ['purchases', ShoppingCart],
  ['stock', Package], ['production', Factory], ['money', IndianRupee],
];

/** A Maks Ops window: the rail (with `active` lit and `badges` counted), and the page. */
export const AppWin = ({ at, active, badges = {}, title, className = '', style, children }) => (
  <div className={`ad-app ${className}`} style={{ ...box(at), ...style }}>
    <div className="ad-app-rail">
      <span className="ad-app-logo"><MoMark size={26} /></span>
      {RAIL.map(([k, icon]) => {
        const Ico = icon;
        return (
          <span key={k} className={`ad-app-ico${active === k ? ' is-active' : ''}`}>
            <Ico size={16} />
            {badges[k] ? <b className="ad-app-badge">{badges[k]}</b> : null}
          </span>
        );
      })}
    </div>
    <div className="ad-app-main">
      <div className="ad-app-top">
        <span className="ad-app-search"><Search size={12} /> Search</span>
        <Bell size={14} />
        <span className="ad-app-me">P</span>
      </div>
      {title && <div className="ad-app-title">{title}</div>}
      <div className="ad-app-body">{children}</div>
    </div>
  </div>
);

/** The customer's browser at `url` (typed so far). */
export const Browser = ({ at, url, className = '', style, children }) => (
  <div className={`ad-browser ${className}`} style={{ ...box(at), ...style }}>
    <div className="ad-browser-bar">
      <i /><i /><i />
      <span className="ad-browser-url">{url}<b className="ad-caret" /></span>
    </div>
    <div className="ad-browser-body">{children}</div>
  </div>
);

/**
 * The order, CO-0012, with its readiness ring.
 * state: 'idle' | 'checking' | 'short' | 'ready'
 */
export const OrderCard = ({ at, state = 'idle', className = '', style }) => {
  const value = state === 'short' ? STOCK.buildable / QTY : state === 'ready' ? 1 : state === 'checking' ? 0.22 : 0;
  const tone = state === 'ready' ? 'green' : state === 'short' ? 'red' : 'amber';
  return (
    <div className={`ad-card ad-order is-${state} ${className}`} style={{ ...box(at), ...style }}>
      <div className="ad-order-main">
        <span className="ad-eyebrow">Customer order</span>
        <b className="ad-id">{IDS.co}</b>
        <span className="ad-order-what">{PRODUCT.name}</span>
        <span className="ad-muted">{QTY} nos · {CUSTOMER.short}</span>
      </div>
      <Ring size={104} stroke={10} value={value} tone={tone} spin={state === 'checking'} dur={state === 'ready' ? 1400 : 1000}>
        {state === 'checking' ? <small>checking</small>
          : <><b>{state === 'ready' ? QTY : state === 'short' ? STOCK.buildable : '–'}</b><small>of {QTY}</small></>}
      </Ring>
      <div className="ad-order-say">
        {state === 'checking' && <span className="ad-muted">Checking stock…</span>}
        {state === 'short' && <><b>Can build {STOCK.buildable} of {QTY}</b> <span className="ad-chip tone-red">blocked by SS304 sheet</span></>}
        {state === 'ready' && <span className="ad-ok">All {QTY} can be built with stock on hand</span>}
      </div>
    </div>
  );
};
