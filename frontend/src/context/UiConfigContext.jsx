import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const UiConfigContext = createContext({});

export function UiConfigProvider({ children }) {
  const [config, setConfig] = useState({});

  const updateKey = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    // Load config from API if available (Spring Boot endpoint — skipped in local/Render mode)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) return;

    fetch(`${apiUrl}/ui-config/all`)
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const flat = {};
        for (const [key, entry] of Object.entries(data)) {
          flat[key] = entry.value ?? entry;
        }
        setConfig(flat);
      })
      .catch(() => {
        // ui-config endpoint doesn't exist on Node backend — silently skip
      });

    // WebSocket disabled — only used with Spring Boot STOMP
  }, [updateKey]);

  return (
    <UiConfigContext.Provider value={{ config, updateKey }}>
      {children}
    </UiConfigContext.Provider>
  );
}

export const useUiConfigContext = () => useContext(UiConfigContext);
