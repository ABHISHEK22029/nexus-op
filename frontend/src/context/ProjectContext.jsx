import React, { createContext, useContext, useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const ProjectContext = createContext();

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);

  const fetchProjects = () => {
    fetch(`${API}/projects`)
      .then(res => res.json())
      .then(data => {
         setProjects(data);
         if (data.length > 0 && !activeProject) setActiveProject(data[data.length - 1]);
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
