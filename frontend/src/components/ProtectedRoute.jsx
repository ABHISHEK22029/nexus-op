import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SessionGate from './SessionGate';

/* Gates the application layer. If there is no active session, the
   user is redirected to /login (remembering where they were headed).

   A session that ends WHILE a screen is open is different: the screen
   stays, and SessionGate asks for the password over it, so nothing typed
   is lost (see lib/apiAuth.js). */
export default function ProtectedRoute({ children }) {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}<SessionGate /></>;
}
