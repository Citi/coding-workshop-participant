import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router-dom'

/**
 * A project's name, linking to its detail page. overflow-wrap: break-word (not word-break) keeps a
 * squeezed table column at least as wide as the longest word: names never break mid-word.
 */
export default function ProjectLink({ id, name }) {
  return (
    <Link component={RouterLink} to={`/projects/${id}`} sx={{ fontWeight: 600, overflowWrap: 'break-word' }}>
      {name}
    </Link>
  )
}
