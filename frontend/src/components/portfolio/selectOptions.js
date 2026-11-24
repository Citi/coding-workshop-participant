/**
 * Helpers for select inputs whose options load asynchronously.
 */

/**
 * Make sure the selected value is among the options, so a select restored from the URL
 * shows a sensible label (and MUI does not warn) before its options have loaded.
 * @param {{value: string, label: string}[]} options - Loaded options.
 * @param {string} value - Selected value ('' for none).
 * @param {(value: string) => string} placeholderLabel - Label for a value not loaded yet.
 * @returns {{value: string, label: string}[]} Options including the selected value.
 */
export function withSelectedOption(options, value, placeholderLabel) {
  if (!value || options.some((option) => option.value === value)) {
    return options;
  }
  return [...options, { value, label: placeholderLabel(value) }];
}
