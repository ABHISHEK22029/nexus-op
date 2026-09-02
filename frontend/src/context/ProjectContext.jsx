import React, { createContext, useContext, useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ProjectContext = createContext();

/* The chosen project decides what almost every screen shows, so forgetting
   it is not a small thing: it used to default to data[data.length - 1] —
   whichever project happened to sort last — with nothing persisted. Pick a
   project, reload, and you were silently looking at a different company's
   work with no indication anything had changed. */
const STORAGE_KEY = 'nexus_active_project';

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);

  /* Remember the choice. Wrapped rather than done in an effect so the write
     happens on the user's action, not on every render that touches it. */
  const setActiveProject = (p) => {
    setActiveProjectState(p);
    try {
      if (p?.id) localStorage.setItem(STORAGE_KEY, String(p.id));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* private mode — losing the preference is survivable */ }
  };

  const fetchProjects = () => {
    // Skip before login — /projects requires auth; a pre-login call would 401.
    if (!localStorage.getItem('nexus_token')) return;
    fetch(`${API}/projects`)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.items || []);
        setProjects(list);
        if (!list.length || activeProject) return;

        /* Restore the remembered project, but only if it is still in the
           list — the stored id may belong to another account, or to a
           project since deleted. Falling back rather than showing nothing. */
        let remembered = null;
        try {
          const id = localStorage.getItem(STORAGE_KEY);
          if (id) remembered = list.find(p => String(p.id) === id) || null;
        } catch { /* ignore */ }

        setActiveProject(remembered || list[list.length - 1]);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (activeProject) {
      fetch(`${API}/work-orders?projectId=${activeProject.id}`)
        .then(res => res.json())
        .then(data => setWorkOrders(data));
    } else {
      setWorkOrders([]);
    }
  }, [activeProject]);

  const getEnabledModules = () => {
    if (!activeProject) return [];
    if (activeProject.type === 'construction') {
        return ['BOQ', 'Indent', 'Measurement Book', 'Milestones', 'Chainage'];
    }
    return [];
  };

  return (
    <ProjectContext.Provider value={{ projects, activeProject, setActiveProject, workOrders, fetchProjects, enabledModules: getEnabledModules() }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => useContext(ProjectContext);
