import { createContext, useContext, useState, useCallback } from 'react';

const UiConfigContext = createContext({});

/**
 * UiConfigProvider — dynamic UI configuration (labels, feature flags,
 * dropdown options, visible table columns). See hooks/useUiConfig.js.
 *
 * DORMANT BY DESIGN. This provider currently serves an empty config, so every
 * useUiConfig() call falls back to its hard-coded default — which is exactly
 * the behaviour the app has always had.
 *
 * It previously fetched `/ui-config/all`, an endpoint written for the (never
 * deployed) Spring Boot backend that queried a `ui_config` table no migration
 * ever created. That request failed on every login and the error was swallowed,
 * so config was always empty. The dead request and endpoint were removed in the
 * Phase 0 cleanup; this scaffold was deliberately kept.
 *
 * To activate: create the `ui_config` table, add a real endpoint, and populate
 * `config` here. The consuming hook needs no changes.
 */
export function UiConfigProvider({ children }) {
  const [config, setConfig] = useState({});

  const updateKey = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <UiConfigContext.Provider value={{ config, updateKey }}>
      {children}
    </UiConfigContext.Provider>
  );
}

export const useUiConfigContext = () => useContext(UiConfigContext);
