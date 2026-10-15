import React from 'react';
import { MaksAppIcon } from '../../../brand/MaksOpsLogo';

/* The Maks Ops mark in the film and the ad: the app icon — the ribbon M
   on its orange tile — the same drawing as the browser tab's icon
   (public/favicon.svg) and the app's own (components/brand/MaksOpsLogo),
   so the film, the tab and the product agree. */
export const MoMark = ({ size = 64 }) => (
  <MaksAppIcon size={size} className="fm-mo" title="Maks Ops" />
);
