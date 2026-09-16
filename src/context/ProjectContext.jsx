'use client';
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { translate, SUPPORTED_LANGS } from '@/lib/i18n';

const ProjectContext = createContext(null);
const LANG_KEY = 'gtm-lang';

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProjectState] = useState(null);
  const [loading, setLoading] = useState(true);
  // Manual language override chosen by the person (login page toggle / sidebar switch).
  const [manualLang, setManualLang] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && SUPPORTED_LANGS.includes(saved)) setManualLang(saved);
    } catch {}
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);

        // Restore saved project from localStorage or pick first
        const savedId = localStorage.getItem('gtm_active_project');
        const saved = data.find(p => String(p.id) === savedId);
        if (saved) {
          setActiveProjectState(saved);
        } else if (data.length > 0) {
          setActiveProjectState(data[0]);
          localStorage.setItem('gtm_active_project', String(data[0].id));
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const setActiveProject = useCallback((project) => {
    setActiveProjectState(project);
    localStorage.setItem('gtm_active_project', String(project.id));
  }, []);

  const createProject = useCallback(async (data) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create project');
    }
    const newProject = await res.json();
    setProjects(prev => [...prev, newProject]);
    setActiveProject(newProject);
    return newProject;
  }, [setActiveProject]);

  const refreshProjects = fetchProjects;

  // UI language: explicit choice > active project's language > user's language > English
  const lang = manualLang || activeProject?.language || user?.language || 'en';

  const setLang = useCallback((l) => {
    const next = SUPPORTED_LANGS.includes(l) ? l : 'en';
    setManualLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch {}
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  const value = useMemo(() => ({
    projects,
    activeProject,
    setActiveProject,
    createProject,
    refreshProjects,
    loading,
    projectId: activeProject?.id || null,
    lang,
    setLang,
    t,
  }), [projects, activeProject, setActiveProject, createProject, refreshProjects, loading, lang, setLang, t]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

/** Shorthand for components that only need the translator. */
export function useT() {
  const { t, lang } = useProject();
  return { t, lang };
}
