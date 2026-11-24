import { useParams } from 'react-router-dom';
import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Project detail (route /projects/:id) with Overview, Deliverables, Dependencies, Budget
 * and Risk tabs. Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function ProjectDetailPage() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="Project details" subtitle={`Project #${id}`} />
      <ComingSoon message="Overview, Deliverables, Dependencies, Budget and Risk tabs will appear here." />
    </>
  );
}

/** Takes no props. */
ProjectDetailPage.propTypes = {};
