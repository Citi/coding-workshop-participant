/**
 * State and submit flow shared by the create/edit forms of the project pages.
 */
import { useCallback, useId, useRef, useState } from 'react';
import { useNotify } from '../../notifications/useNotify.js';
import { describeFormError } from '../../utils/validation.js';

/**
 * Manage one form: values, client-side validation before submit, the API's per-field errors
 * placed next to the fields, a summary error, a disabled state while saving, and focus on
 * the first invalid field. Mount the form afresh (for example with a `key`) to start over.
 *
 * @example
 * const form = useEntityForm({ initialValues, fields: PROJECT_FIELDS, validate: validateProject,
 *   submit: (values) => createProject(projectPayload(values)), onSaved: close,
 *   failureMessage: 'The project was not saved.' });
 * <TextField label="Project name" {...form.fieldProps('project_name')} />
 *
 * @param {object} options - Form options.
 * @param {Record<string, string>} options.initialValues - Starting values.
 * @param {readonly string[]} options.fields - Field names in screen order.
 * @param {(values: Record<string, string>) => Record<string, string>} options.validate - Client checks.
 * @param {(values: Record<string, string>) => Promise<any>} options.submit - Sends the request.
 * @param {(result: any) => void} options.onSaved - Called with the submit result on success.
 * @param {string|((error: Error) => string)} [options.failureMessage] - Snackbar text when the
 *   server rejects the form (or a function of the error); the server's message when omitted.
 * @param {boolean} [options.clearSummaryOnChange] - Clear the summary error as soon as a field
 *   changes (for inline forms whose rejection should not outlive the values that caused it).
 * @returns {{values: Record<string, string>, errors: Record<string, string>, formError: string,
 *   submitError: Error|null, submitting: boolean, setValue: (name: string, value: string) => void,
 *   handleChange: (event: {target: {name: string, value: string}}) => void,
 *   handleSubmit: (event?: {preventDefault: () => void}) => Promise<void>,
 *   fieldProps: (name: string, helperText?: string) => object,
 *   reset: (values?: Record<string, string>) => void}} Form state and handlers; `submitError` is the
 *   last error the server returned (an ApiError), for forms that react to its code.
 */
export function useEntityForm({
  initialValues,
  fields,
  validate,
  submit,
  onSaved,
  failureMessage,
  clearSummaryOnChange = false,
}) {
  const formId = useId();
  const notify = useNotify();
  const inputs = useRef({});
  const busy = useRef(false);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback(
    (name, value) => {
      setValues((previous) => ({ ...previous, [name]: value }));
      if (clearSummaryOnChange) {
        setFormError('');
        setSubmitError(null);
      }
      setErrors((previous) => {
        if (!previous[name]) {
          return previous;
        }
        const next = { ...previous };
        delete next[name];
        return next;
      });
    },
    [clearSummaryOnChange],
  );

  const reset = useCallback(
    (nextValues) => {
      setValues(nextValues ?? initialValues);
      setErrors({});
      setFormError('');
      setSubmitError(null);
    },
    [initialValues],
  );

  const handleChange = useCallback((event) => setValue(event.target.name, event.target.value), [setValue]);

  const focusFirstError = (found) => {
    const name = fields.find((field) => found[field]);
    const input = name ? inputs.current[name] : null;
    if (input && typeof input.focus === 'function') {
      input.focus();
    }
  };

  const handleSubmit = async (event) => {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (busy.current) {
      return;
    }
    const found = validate(values);
    setErrors(found);
    setFormError('');
    setSubmitError(null);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }
    busy.current = true;
    setSubmitting(true);
    let result;
    try {
      result = await submit(values);
    } catch (error) {
      busy.current = false;
      const described = describeFormError(error, [...fields]);
      setErrors(described.fieldErrors);
      setFormError(described.message);
      setSubmitError(error);
      setSubmitting(false);
      const summary = typeof failureMessage === 'function' ? failureMessage(error) : failureMessage;
      notify.error(summary || described.message);
      focusFirstError(described.fieldErrors);
      return;
    }
    busy.current = false;
    setSubmitting(false);
    onSaved(result);
  };

  /**
   * Props that wire a TextField (text, date or select) to the form.
   * @param {string} name - Field name.
   * @param {string} [helperText] - Hint shown when the field has no error.
   * @returns {object} TextField props.
   */
  const fieldProps = (name, helperText = ' ') => ({
    id: `${formId}-${name}`,
    name,
    value: values[name] ?? '',
    onChange: handleChange,
    inputRef: (element) => {
      inputs.current[name] = element;
    },
    error: Boolean(errors[name]),
    helperText: errors[name] || helperText,
    disabled: submitting,
    fullWidth: true,
  });

  return {
    values,
    errors,
    formError,
    submitError,
    submitting,
    setValue,
    handleChange,
    handleSubmit,
    fieldProps,
    reset,
  };
}

export default useEntityForm;
