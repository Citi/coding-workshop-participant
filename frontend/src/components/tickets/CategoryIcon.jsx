import BoltIcon from '@mui/icons-material/Bolt'
import ChairIcon from '@mui/icons-material/Chair'
import ComputerIcon from '@mui/icons-material/Computer'
import DomainIcon from '@mui/icons-material/Domain'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import PrintIcon from '@mui/icons-material/Print'
import ThermostatIcon from '@mui/icons-material/Thermostat'
import WifiIcon from '@mui/icons-material/Wifi'
import PropTypes from 'prop-types'

/** One icon per ticket category (the API's codes). */
export const CATEGORY_ICONS = {
  network: WifiIcon,
  hardware: ComputerIcon,
  printer: PrintIcon,
  hvac: ThermostatIcon,
  electrical: BoltIcon,
  furniture: ChairIcon,
  building_facilities: DomainIcon,
  other: HelpOutlineIcon,
}

/** A category's icon. Decorative: the category name is always written nearby. */
function CategoryIcon({ category, ...props }) {
  const Icon = CATEGORY_ICONS[category] ?? HelpOutlineIcon
  return <Icon aria-hidden="true" {...props} />
}

CategoryIcon.propTypes = {
  category: PropTypes.string.isRequired,
}

export default CategoryIcon
