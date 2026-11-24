/**
 * Path helpers shared by the service modules.
 */

/**
 * Build the path of one record, encoding the id so it cannot change the route.
 * @param {string} base - Collection path, e.g. `/projects`.
 * @param {number|string} id - Record id.
 * @param {string} [suffix] - Optional sub-resource, e.g. `/risk`.
 * @returns {string} Path such as `/projects/1/risk`.
 */
export function itemPath(base, id, suffix = '') {
  return `${base}/${encodeURIComponent(String(id))}${suffix}`;
}
