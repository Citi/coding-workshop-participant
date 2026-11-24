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
 * @param {string} [options.failureMessage] - Snackbar text when the server rejects the form.
 * @returns {{values: Record<string, string>, errors: Record<string, string>, formError: string,
 *   submitting: boolean, setValue: (name: string, value: string) => void,
 *   handleChange: (event: {target: {name: string, value: string}}) => void,
 *   handleSubmit: (event?: {preventDefault: () => void}) => Promise<void>,
 *   fieldProps: (name: string, helperText?: string) => object}} Form state and handlers.
 */
export function useEntityForm({ initialValues, fields, validate, submit, onSaved, failureMessage }) {
  const formId = useId();
  const notify = useNotify();
  const inputs = useRef({});
  const busy = useRef(false);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback((name, value) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => {
      if (!previous[name]) {
        return previous;
      }
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }, []);

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
      setSubmitting(false);
      notify.error(failureMessage || described.message);
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

  return { values, errors, formError, submitting, setValue, handleChange, handleSubmit, fieldProps };
}

export default useEntityForm;
