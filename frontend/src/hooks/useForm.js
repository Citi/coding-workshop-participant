import { useCallback, useState } from 'react';

/**
 * Small form-state hook: values, per-field errors, client validation and
 * mapping of server-side field errors (ApiError.details) back onto fields.
 *
 * @param {object} initial Initial values.
 * @param {(values: object) => object} [validate] Returns `{field: message}` for invalid fields.
 */
export default function useForm(initial, validate) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setField = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  /** Props for a MUI TextField bound to `name`. */
  const field = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => setField(name, e.target.value),
    error: Boolean(errors[name]),
    helperText: errors[name] || undefined,
  });

  const reset = useCallback((next) => {
    setValues(next);
    setErrors({});
    setFormError('');
  }, []);

  /**
   * Validate then run `action(values)`; returns true on success.
   * @param {(values: object) => Promise<any>} action
   */
  const submit = async (action) => {
    const clientErrors = validate ? validate(values) : {};
    const hasErrors = Object.values(clientErrors).some(Boolean);
    setErrors(clientErrors);
    setFormError('');
    if (hasErrors) return false;
    setSubmitting(true);
    try {
      await action(values);
      return true;
    } catch (err) {
      if (err.details && Object.keys(err.details).length) setErrors(err.details);
      setFormError(err.message || 'Something went wrong.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    values, setValues, setField, errors, formError, submitting, field, submit, reset,
  };
}
