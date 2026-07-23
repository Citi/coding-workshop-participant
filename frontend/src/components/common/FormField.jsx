import { MenuItem, TextField } from '@mui/material';

/**
 * A labelled input with inline validation, wrapping MUI's TextField.
 *
 * Exists so every form marks required fields, associates its error text with
 * the input, and positions messages the same way. Handles text, number, date,
 * multiline and select in one component -- a select is just a TextField with
 * `options`.
 *
 * @param {string} name       must match the key in the form's values/errors
 * @param {string} label
 * @param {any}    value
 * @param {Function} onChange receives the native change event
 * @param {string} [error]    message shown beneath the field
 * @param {string} [helperText] shown when there is no error
 * @param {boolean} [required]
 * @param {Array<{value: any, label: string}>|string[]} [options] renders a select
 */
export default function FormField({
  name,
  label,
  value,
  onChange,
  error,
  helperText,
  required = false,
  options,
  type = 'text',
  multiline = false,
  rows,
  disabled = false,
  fullWidth = true,
  ...rest
}) {
  const isSelect = Array.isArray(options);

  // Tolerate both ['labor', ...] and [{ value, label }, ...].
  const normalisedOptions = isSelect
    ? options.map((option) =>
        typeof option === 'object' && option !== null
          ? option
          : { value: option, label: String(option) },
      )
    : [];

  return (
    <TextField
      id={`field-${name}`}
      name={name}
      label={label}
      // A null value would flip the input to uncontrolled and log a warning.
      value={value ?? ''}
      onChange={onChange}
      required={required}
      disabled={disabled}
      fullWidth={fullWidth}
      select={isSelect}
      type={isSelect ? undefined : type}
      multiline={multiline}
      rows={multiline ? (rows ?? 3) : undefined}
      error={Boolean(error)}
      // The error replaces the hint rather than stacking, so field height stays
      // stable and the message the user needs is the one they see.
      helperText={error || helperText || ' '}
      aria-invalid={Boolean(error)}
      slotProps={{
        // Date inputs have no placeholder, so the label must stay lifted or it
        // overlaps the browser's own date UI.
        inputLabel: type === 'date' ? { shrink: true } : undefined,
        formHelperText: { sx: { minHeight: '1.25em', mx: 0 } },
      }}
      {...rest}
    >
      {normalisedOptions.map((option) => (
        <MenuItem key={String(option.value)} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
