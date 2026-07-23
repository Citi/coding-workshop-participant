/* eslint-disable react-hooks/set-state-in-effect --
 * Clearing on sign-out reacts to the auth state changing; leaving the
 * previous user's projects on screen would leak data between sessions.
 */
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as projectService from '../services/projectService';
import useAuth from '../hooks/useAuth';

/**
 * The project list, loaded once and shared.
 *
 * Projects are referenced by nearly every screen -- as a filter on
 * deliverables, as the target of an allocation, as the subject of a budget.
 * Fetching them per page meant the same request three times on one navigation,
 * and three chances for the screens to disagree about what exists.
 *
 * Mutations go through here too, so creating a project updates the list
 * everywhere at once rather than leaving a stale dropdown behind.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await projectService.listProjects();
      setProjects(Array.isArray(rows) ? rows : []);
      setLoaded(true);
      return rows;
    } catch (caught) {
      setError(caught);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load once the user is signed in, and clear on sign-out so the next user
  // never sees the previous one's data.
  useEffect(() => {
    if (!isAuthenticated) {
      setProjects([]);
      setLoaded(false);
      setError(null);
      return;
    }
    refresh().catch(() => {
      // Captured into `error`; the consuming screen decides how to show it.
    });
  }, [isAuthenticated, refresh]);

  const create = useCallback(async (payload) => {
    const created = await projectService.createProject(payload);
    setProjects((current) => [...current, created]);
    return created;
  }, []);

  const update = useCallback(async (id, payload) => {
    const updated = await projectService.updateProject(id, payload);
    setProjects((current) => current.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const remove = useCallback(async (id) => {
    await projectService.deleteProject(id);
    setProjects((current) => current.filter((p) => p.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      projects,
      loading,
      error,
      loaded,
      refresh,
      create,
      update,
      remove,
      /** Look one up without a round trip -- for breadcrumbs and labels. */
      getById: (id) => projects.find((project) => project.id === id) ?? null,
      /** Ready for a <FormField options={...}> select. */
      options: projects.map((project) => ({ value: project.id, label: project.name })),
    }),
    [projects, loading, error, loaded, refresh, create, update, remove],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
