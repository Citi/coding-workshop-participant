/**
 * Small form helpers shared by the portfolio dialogs (allocations, deliverables, users and
 * departments). The server validates every request again; these checks only catch obvious
 * mistakes before a round trip.
 */
import { useCallback, useState } from 'react';

/**
 * Check whether a form value is empty once trimmed.
 * @param {unknown} value - Raw input value.
 * @returns {boolean} True for undefined, null and blank strings.
 */
export function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Parse a whole number typed into a text or number input.
 * @param {unknown} value - Raw input value.
 * @param {number} min - Smallest allowed value.
 * @param {number} max - Largest allowed value.
 * @returns {number|null} The integer, or null when it is not a whole number in range.
 */
export function parseIntegerInRange(value, min, max) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) {
    return null;
  }
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

/**
 * Parse a record id held as text (select values and URL parameters are strings).
 * @param {unknown} value - Raw value such as "3".
 * @returns {number|null} A positive integer id, or null when missing or invalid.
 */
export function parseId(value) {
  return parseIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER);
}

/**
 * Check that an optional ISO date range is in order. Dates are `YYYY-MM-DD` strings, so
 * they compare correctly as text.
 * @param {string} start - First day (may be empty).
 * @param {string} end - Last day (may be empty).
 * @returns {boolean} True unless both are set and `end` is before `start`.
 */
export function isDateRangeValid(start, end) {
  return isBlank(start) || isBlank(end) || String(end) >= String(start);
}

/**
 * Remove one key from an errors object without mutating it.
 * @param {Record<string, string>} errors - Current errors.
 * @param {string} name - Field to clear.
 * @returns {Record<string, string>} The same object when nothing changes, else a copy.
 */
function withoutError(errors, name) {
  if (!errors[name]) {
    return errors;
  }
  const next = { ...errors };
  delete next[name];
  return next;
}

/**
 * Values plus per-field errors for a dialog form. Editing a field clears its error.
 * @param {Record<string, any>|(() => Record<string, any>)} initialValues - Starting values, or a
 *   function returning them (read once, on mount, like useState).
 * @returns {{values: Record<string, any>, errors: Record<string, string>,
 *   setField: (name: string, value: any) => void, setValues: Function, setErrors: Function}}
 *   Form state and setters.
 */
export function useFormState(initialValues) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const setField = useCallback((name, value) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => withoutError(previous, name));
  }, []);
  return { values, errors, setField, setValues, setErrors };
}

/**
 * Props that wire an MUI TextField to `useFormState`, with its error shown as helper text.
 * @param {{values: object, errors: object, setField: Function}} form - From `useFormState`.
 * @param {string} name - Field name.
 * @param {{helperText?: string, disabled?: boolean}} [options] - Hint shown when there is no error.
 * @returns {object} Props to spread on a TextField.
 */
export function fieldProps(form, name, { helperText = ' ', disabled = false } = {}) {
  return {
    name,
    value: form.values[name] ?? '',
    onChange: (event) => form.setField(name, event.target.value),
    error: Boolean(form.errors[name]),
    helperText: form.errors[name] || helperText,
    disabled,
    fullWidth: true,
  };
}
