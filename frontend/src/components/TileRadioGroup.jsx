import Box from '@mui/material/Box'
import FormHelperText from '@mui/material/FormHelperText'
import Typography from '@mui/material/Typography'
import PropTypes from 'prop-types'

import { brand } from '../theme'

// Hidden visually but still a real, focusable radio for keyboards and screen readers.
const hiddenInput = {
  position: 'absolute',
  opacity: 0,
  width: '1px',
  height: '1px',
  m: 0,
}

const LAYOUTS = {
  // Icon + label, in a grid (categories).
  tile: { minHeight: 42, px: 1.5, py: 1, gap: 1, alignItems: 'center', borderRadius: 1 },
  // Joined buttons in one row (who is affected).
  segmented: { minHeight: 38, px: 2, py: 0.75, gap: 0.75, alignItems: 'center', justifyContent: 'center', borderRadius: 0 },
}

/**
 * A required single choice drawn as tiles or a segmented control, built on native radio
 * inputs: arrow keys move between options, and the fieldset's legend is announced with
 * each one. Selected options get a blue border and tint (tiles) or a check mark
 * (segmented), so the choice never depends on color alone.
 */
function TileRadioGroup({
  name,
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  error,
  required = false,
  disabled = false,
  variant = 'tile',
  columns = { xs: 2, md: 4 },
}) {
  const errorId = `${name}-error`
  const segmented = variant === 'segmented'
  const gridColumns = Object.fromEntries(Object.entries(columns).map(([bp, n]) => [bp, `repeat(${n}, minmax(0, 1fr))`]))

  return (
    <Box
      component="fieldset"
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? 'true' : undefined}
      disabled={disabled}
      sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
    >
      <Box
        component="legend"
        sx={
          hideLabel
            ? { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }
            : { p: 0, mb: 1, fontSize: 14, color: error ? 'error.main' : brand.inkSoft }
        }
      >
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Box>
      <Box
        sx={
          segmented
            ? {
                display: 'inline-flex',
                flexDirection: { xs: 'column', sm: 'row' },
                width: { xs: '100%', sm: 'auto' },
                border: 1,
                borderColor: error ? 'error.main' : '#C5D3E0',
                borderRadius: 1,
                overflow: 'hidden',
              }
            : { display: 'grid', gridTemplateColumns: gridColumns, gap: 1.25 }
        }
      >
        {options.map((option, index) => {
          const selected = option.value === value
          const Icon = selected && option.selectedIcon ? option.selectedIcon : option.icon
          return (
            <Box
              component="label"
              key={option.value}
              sx={{
                position: 'relative',
                display: 'flex',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                fontSize: 13,
                fontWeight: selected ? 600 : 500,
                color: selected ? brand.navy : brand.inkSoft,
                bgcolor: selected ? (segmented ? brand.selected : '#F3F8FC') : 'background.paper',
                ...LAYOUTS[variant],
                ...(segmented
                  ? {
                      borderLeft: { sm: index === 0 ? 0 : 1 },
                      borderTop: { xs: index === 0 ? 0 : 1, sm: 0 },
                      borderColor: { xs: '#C5D3E0', sm: '#C5D3E0' },
                    }
                  : {
                      // 2px when selected; 1px + matching padding otherwise, so nothing shifts.
                      border: selected ? 2 : 1,
                      borderColor: selected ? 'primary.main' : error ? 'error.main' : '#D3DEE8',
                      m: selected ? 0 : '1px',
                    }),
                '&:hover': disabled ? {} : { borderColor: segmented ? '#C5D3E0' : 'primary.main' },
                '&:has(input:focus-visible)': { outline: `2px solid ${brand.blue}`, outlineOffset: 2, zIndex: 1 },
              }}
            >
              <Box
                component="input"
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                required={required}
                disabled={disabled}
                onChange={() => onChange(name, option.value)}
                sx={hiddenInput}
              />
              {Icon && <Icon aria-hidden="true" sx={{ fontSize: segmented ? 18 : 20, flex: 'none' }} />}
              <Box component="span" sx={{ minWidth: 0 }}>
                <Box component="span" sx={{ display: 'block' }}>
                  {option.label}
                </Box>
                {option.hint && (
                  <Typography component="span" sx={{ display: 'block', mt: 0.25, fontSize: 13, lineHeight: 1.35, color: 'text.secondary' }}>
                    {option.hint}
                  </Typography>
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
      <FormHelperText id={errorId} error={Boolean(error)} sx={{ mx: 0 }}>
        {error || ' '}
      </FormHelperText>
    </Box>
  )
}

TileRadioGroup.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hideLabel: PropTypes.bool,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      hint: PropTypes.string,
      icon: PropTypes.elementType,
      selectedIcon: PropTypes.elementType,
    }),
  ).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  variant: PropTypes.oneOf(['tile', 'segmented']),
  columns: PropTypes.objectOf(PropTypes.number),
}

export default TileRadioGroup
