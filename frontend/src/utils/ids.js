// Record ids in URLs (#/projects/12): positive database integers.

/** The largest id there can be: ids are database integers, and the API answers 400 (not 404) above it. */
export const MAX_ID = 2147483647

/** Only positive whole numbers up to MAX_ID are ids; anything else (e.g. /resources/abc) is "not found". */
export function parseId(value) {
  const text = String(value ?? '')
  return /^[1-9]\d*$/.test(text) && Number(text) <= MAX_ID ? Number(text) : undefined
}
