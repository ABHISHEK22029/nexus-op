/* The icon for each module in lib/navigation.js, by the name it gives.
   Shared by the app's own rail (AppNav) and the product film's copy of it,
   so a module added to the navigation gets its icon in both places — a name
   missing from here falls back to the Home icon. */
import {
  LayoutDashboard, Megaphone, ShoppingBag, ShoppingCart, Package, Factory, Wallet,
  Settings, SlidersHorizontal, Home,
} from 'lucide-react';

export const NAV_ICONS = {
  LayoutDashboard, Megaphone, ShoppingBag, ShoppingCart, Package, Factory, Wallet, Settings, SlidersHorizontal,
};

export const navIcon = (name) => NAV_ICONS[name] || Home;
