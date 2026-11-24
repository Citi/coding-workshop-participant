// A page's views (e.g. List | Heat map) as a group of toggle buttons; the chosen view lives in the URL.
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useSearchParams } from 'react-router-dom'
import { useLatestSearchParams } from '../hooks/useUrlFilters'

/**
 * The pressed view is filled, not just tinted, so it stands out without relying on colour (6.7:1
 * against the white of the others, whose text keeps 5.7:1). MUI's default grey text would only
 * reach 4.49:1 on the page background.
 */
const buttonStyle = (theme) => ({
  gap: 0.75,
  px: 1.5,
  whiteSpace: 'nowrap',
  color: 'text.secondary',
  borderColor: 'grey.400',
  '&.Mui-selected': {
    color: 'primary.contrastText',
    bgcolor: 'primary.main',
    borderColor: 'primary.main',
    '&:hover': { bgcolor: 'primary.dark', '@media (hover: none)': { bgcolor: 'primary.main' } },
  },
  // Drawn above the neighbouring button, with a white gap so the ring also shows against its blue fill.
  '&.Mui-focusVisible': {
    zIndex: 1,
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
  },
  // Windows high-contrast mode drops background colours: keep the pressed view marked.
  '@media (forced-colors: active)': {
    '&.Mui-selected': { forcedColorAdjust: 'none', bgcolor: 'Highlight', color: 'HighlightText', borderColor: 'Highlight' },
  },
})

const groupStyle = { bgcolor: 'background.paper' }
const iconStyle = { display: 'inline-flex', '& svg': { fontSize: '1.125rem' } }

/**
 * The view to show, from the URL: the `param` value when it is one of `allowedValues`, otherwise
 * (missing, unknown or misspelt) `defaultValue`. Pages use it to choose what to render, with the
 * same values as their ViewSwitch:
 *
 *   const view = useViewParam(['list', 'timeline'])
 */
// eslint-disable-next-line react-refresh/only-export-components -- the page and its switch must read the view the same way
export function useViewParam(allowedValues, { param = 'view', defaultValue = 'list' } = {}) {
  const [searchParams] = useSearchParams()
  const value = searchParams.get(param)
  return allowedValues.includes(value) ? value : defaultValue
}

/**
 * Switch between a page's views, e.g. List | Heat map, kept in the URL (#/resources?view=heatmap)
 * so a reload, Back from a detail page and shared links keep it.
 *
 *   const VIEW_OPTIONS = [
 *     { value: 'list', label: 'List', icon: <ViewListIcon /> },
 *     { value: 'timeline', label: 'Timeline', icon: <ViewTimelineIcon /> },
 *   ]
 *   const view = useViewParam(VIEW_OPTIONS.map((option) => option.value))
 *   <ViewSwitch options={VIEW_OPTIONS} />
 *   {view === 'timeline' ? <ProjectTimeline … /> : <DataTable … />}
 *
 * options - [{ value, label, icon? }]: `label` is the visible text and the button's accessible name;
 *   `icon` is an element shown before it and hidden from screen readers
 * param - the URL parameter (default 'view'). Every other parameter (e.g. the filters) is kept.
 * defaultValue - the view shown without the parameter (default 'list'): choosing it removes the
 *   parameter, and a missing or unknown value shows it
 * ariaLabel - the accessible name of the group (default 'View')
 *
 * Choosing a view replaces the current history entry (as the filters do), so Back leaves the page.
 * Clicking the pressed view keeps it. Keyboard: Tab reaches the pressed view, the arrow keys move
 * between the views and Enter or Space chooses one.
 */
export default function ViewSwitch({ options, param = 'view', defaultValue = 'list', ariaLabel = 'View' }) {
  const [, setSearchParams, latest] = useLatestSearchParams()
  const value = useViewParam(
    options.map((option) => option.value),
    { param, defaultValue },
  )
  // MUI makes the first button the tab stop; the pressed one tells keyboard users the current view.
  const tabStop = options.some((option) => option.value === value) ? value : options[0]?.value

  const choose = (event, next) => {
    // An exclusive group reports null when the pressed button is clicked again: that view stays.
    if (next === null) return
    // From the address bar, not the last render: a filter typed a moment ago must survive the switch.
    const params = latest()
    if (!params) return
    if (next === defaultValue) params.delete(param)
    else params.set(param, next)
    setSearchParams(params, { replace: true })
  }

  return (
    <ToggleButtonGroup exclusive size="small" value={value} onChange={choose} aria-label={ariaLabel} sx={groupStyle}>
      {options.map((option) => (
        <ToggleButton key={option.value} value={option.value} tabIndex={option.value === tabStop ? 0 : -1} sx={buttonStyle}>
          {option.icon && (
            <Box component="span" aria-hidden="true" sx={iconStyle}>
              {option.icon}
            </Box>
          )}
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
