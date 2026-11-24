/**
 * Department and people lists for the select inputs of the project forms.
 */
import { useApi } from '../../hooks/useApi.js';
import { listDepartments } from '../../services/departments.js';
import { listUsers } from '../../services/users.js';

/** The API's largest page; departments and users fit in one page at ACME's size. */
const MAX_OPTIONS = 200;

/**
 * Build sorted `{value, label}` options, adding the record's current value when the list does
 * not contain it (for example while the list loads), so a select never holds an unknown value.
 * @param {object[]|undefined} items - Records from the API.
 * @param {{id: number, name?: string|null}|null|undefined} current - Value the form starts with.
 * @param {(item: object) => object} toOption - Maps a record to an option.
 * @returns {Array<{value: string, label: string}>} Options sorted by label.
 */
function buildOptions(items, current, toOption) {
  const options = (items ?? []).map(toOption);
  if (current && current.id !== null && current.id !== undefined) {
    const value = String(current.id);
    if (!options.some((option) => option.value === value)) {
      options.push({ value, label: current.name || `#${value}` });
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Load the option lists a form needs.
 * @param {object} [options] - What to load.
 * @param {boolean} [options.departments] - Load departments.
 * @param {boolean} [options.users] - Load users.
 * @param {{department?: {id: number, name?: string}|null, user?: {id: number, name?: string}|null}|null}
 *   [options.current] - Values of the record being edited, kept selectable while lists load.
 * @returns {{departments: Array<{value: string, label: string}>,
 *   users: Array<{value: string, label: string, role?: string}>, loading: boolean,
 *   error: Error|null, reload: () => void}} Options and request state.
 */
export function useOptions({ departments = false, users = false, current = null } = {}) {
  const departmentList = useApi((signal) => listDepartments({ limit: MAX_OPTIONS }, { signal }), [], {
    enabled: departments,
  });
  const userList = useApi((signal) => listUsers({ limit: MAX_OPTIONS }, { signal }), [], { enabled: users });

  return {
    departments: buildOptions(departmentList.data?.items, current?.department, (item) => ({
      value: String(item.id),
      label: item.name,
    })),
    users: buildOptions(userList.data?.items, current?.user, (item) => ({
      value: String(item.id),
      label: item.name,
      role: item.role,
    })),
    loading: departmentList.loading || userList.loading,
    error: departmentList.error || userList.error,
    reload: () => {
      if (departments) {
        departmentList.reload();
      }
      if (users) {
        userList.reload();
      }
    },
  };
}

export default useOptions;
