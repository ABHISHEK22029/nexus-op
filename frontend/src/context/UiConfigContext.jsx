import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const UiConfigContext = createContext({});

export function UiConfigProvider({ children }) {
  const [config, setConfig] = useState({});

  const updateKey = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    // 1. Load all config on mount
    const token = localStorage.getItem('nexus_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`${import.meta.env.VITE_API_URL}/ui-config/all`, { headers })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        // Flatten: { "vendor.form.gstin.label": { value: {...} } } → { key: value }
        const flat = {};
        for (const [key, entry] of Object.entries(data)) {
          flat[key] = entry.value ?? entry;
        }
        setConfig(flat);
      })
      .catch(() => console.warn('[UiConfig] Failed to load config'));

    // 2. Subscribe to WebSocket for real-time updates
    // (WebSocket is on /ws, Spring Boot STOMP endpoint)
    let ws;
    const connectWs = () => {
      try {
        ws = new WebSocket(
          `${import.meta.env.VITE_API_URL?.replace('http', 'ws')}/ws/websocket`
        );
        ws.onopen = () => console.log('[UiConfig] WebSocket connected');
        ws.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data);
            if (event.configKey && event.newValue !== undefined) {
              updateKey(event.configKey, event.newValue);
              console.log(`[UiConfig] Live update: ${event.configKey}`);
            }
          } catch (err) {
            // STOMP frames, ignore
          }
        };
        ws.onerror = () => {};
        ws.onclose = () => setTimeout(connectWs, 3000); // reconnect
      } catch (e) {}
    };
    connectWs();

    return () => ws?.close();
  }, [updateKey]);

  return (
    <UiConfigContext.Provider value={{ config, updateKey }}>
      {children}
    </UiConfigContext.Provider>
  );
}

export const useUiConfigContext = () => useContext(UiConfigContext);
