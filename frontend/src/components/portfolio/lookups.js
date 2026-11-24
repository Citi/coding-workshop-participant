/**
 * Reference data for the portfolio pages: departments, projects and users, loaded once per
 * page for filter and form selects. Every role may read all three (spec section 7). Each hook
 * loads one page of up to LOOKUP_LIMIT records, the API maximum.
 */
import { useMemo } from 'react';
import useApi from '../../hooks/useApi.js';
import { listDepartments } from '../../services/departments.js';
import { listProjects } from '../../services/projects.js';
import { listUsers } from '../../services/users.js';

/** Largest page the API serves (spec section 8). */
export const LOOKUP_LIMIT = 200;

const NO_ITEMS = Object.freeze([]);

const departmentLabel = (department) => department.name;
const projectLabel = (project) => project.project_name;
const userLabel = (user) => user.name;

/**
 * Turn a list response into select options and a name lookup.
 * @param {{data: any, loading: boolean, error: Error|null, reload: () => void}} result - From useApi.
 * @param {(item: object) => string} labelOf - Display name of one record.
 * @returns {{items: object[], options: {value: string, label: string}[], nameById: Map<number, string>,
 *   loading: boolean, error: Error|null, reload: () => void}} Lookup data.
 */
function useLookupResult({ data, loading, error, reload }, labelOf) {
  const items = data?.items ?? NO_ITEMS;
  const derived = useMemo(
    () => ({
      // Select values are strings so they match values read back from inputs and URLs.
      options: items.map((item) => ({ value: String(item.id), label: labelOf(item) })),
      nameById: new Map(items.map((item) => [item.id, labelOf(item)])),
    }),
    [items, labelOf],
  );
  return { items, ...derived, loading, error, reload };
}

/**
 * All departments, for department filters and selects.
 * @returns {ReturnType<typeof useLookupResult>} Departments as items, options and names by id.
 */
export function useDepartmentsLookup() {
  const result = useApi((signal) => listDepartments({ limit: LOOKUP_LIMIT }, { signal }), []);
  return useLookupResult(result, departmentLabel);
}

/**
 * All projects, for project filters and selects.
 * @returns {ReturnType<typeof useLookupResult>} Projects as items, options and names by id.
 */
export function useProjectsLookup() {
  const result = useApi((signal) => listProjects({ limit: LOOKUP_LIMIT }, { signal }), []);
  return useLookupResult(result, projectLabel);
}

/**
 * All users, for person, assignee and actor selects.
 * @returns {ReturnType<typeof useLookupResult>} Users as items, options and names by id.
 */
export function useUsersLookup() {
  const result = useApi((signal) => listUsers({ limit: LOOKUP_LIMIT }, { signal }), []);
  return useLookupResult(result, userLabel);
}
