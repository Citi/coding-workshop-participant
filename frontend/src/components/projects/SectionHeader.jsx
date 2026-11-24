import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Heading row for a section inside a tab: an h2 (or h3), an optional line of context and
 * optional actions on the right that wrap under the heading on narrow screens.
 * @param {object} props - Component props.
 * @param {string} props.title - Section heading.
 * @param {string} [props.id] - Id for the heading, so the section can be labelled by it.
 * @param {import('react').ReactNode} [props.subtitle] - Context under the heading.
 * @param {import('react').ReactNode} [props.actions] - Buttons on the right.
 * @param {'h2'|'h3'} [props.component] - Heading level.
 * @returns {JSX.Element} The heading row.
 */
export default function SectionHeader({ title, id, subtitle, actions, component = 'h2' }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 1,
        mb: 1.5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography id={id} variant="h6" component={component}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" component="div">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ? <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{actions}</Box> : null}
    </Box>
  );
}

SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  id: PropTypes.string,
  subtitle: PropTypes.node,
  actions: PropTypes.node,
  component: PropTypes.oneOf(['h2', 'h3']),
};
