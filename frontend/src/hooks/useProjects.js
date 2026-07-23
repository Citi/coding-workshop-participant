import { useContext } from 'react';
import { ProjectContext } from '../context/ProjectContext';

/**
 * Reads the shared project list.
 *
 * @returns {{
 *   projects: object[],
 *   loading: boolean,
 *   error: Error|null,
 *   loaded: boolean,
 *   refresh: () => Promise<object[]>,
 *   create: (payload: object) => Promise<object>,
 *   update: (id: string, payload: object) => Promise<object>,
 *   remove: (id: string) => Promise<void>,
 *   getById: (id: string) => object|null,
 *   options: Array<{value: string, label: string}>,
 * }}
 */
export default function useProjects() {
  const context = useContext(ProjectContext);

  if (context === null) {
    throw new Error('useProjects must be used inside a <ProjectProvider>');
  }

  return context;
}
