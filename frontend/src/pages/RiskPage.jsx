import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Risk intelligence (route /risk): projects ranked by score and level.
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function RiskPage() {
  return (
    <>
      <PageHeader
        title="Risk Intelligence"
        subtitle="Projects ranked by explainable delivery risk."
      />
      <ComingSoon message="Projects ranked by risk score, with a link to each project's Risk tab, will appear here." />
    </>
  );
}
