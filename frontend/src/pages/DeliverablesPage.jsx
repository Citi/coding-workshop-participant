import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Portfolio-wide deliverables (route /deliverables) with project, status, assignee and overdue filters.
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function DeliverablesPage() {
  return (
    <>
      <PageHeader
        title="Deliverables"
        subtitle="Every deliverable across the portfolio, with status, owner and due date."
      />
      <ComingSoon message="A portfolio-wide deliverable list with project, status, assignee and overdue filters will appear here." />
    </>
  );
}
