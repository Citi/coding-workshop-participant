import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router-dom'

/** A project's name, linking to its detail page. */
export default function ProjectLink({ id, name }) {
  return (
    <Link component={RouterLink} to={`/projects/${id}`} sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
      {name}
    </Link>
  )
}
