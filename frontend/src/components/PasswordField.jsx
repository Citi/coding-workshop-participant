import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import PropTypes from 'prop-types'

/**
 * A password TextField with a show/hide button. Every other prop goes to the TextField.
 * The button is named after the field ("Show confirm password") so two on one form stay
 * distinguishable.
 */
function PasswordField({ label, disabled = false, slotProps = {}, ...props }) {
  const [visible, setVisible] = useState(false)
  const action = `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`

  return (
    <TextField
      {...props}
      label={label}
      type={visible ? 'text' : 'password'}
      disabled={disabled}
      slotProps={{
        ...slotProps,
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label={action}
                aria-pressed={visible}
                edge="end"
                disabled={disabled}
                onClick={() => setVisible(!visible)}
                // Keep focus (and the caret) in the field when toggling with the mouse.
                onMouseDown={(event) => event.preventDefault()}
              >
                {visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}

PasswordField.propTypes = {
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  slotProps: PropTypes.object,
}

export default PasswordField
