import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Budget analytics (route /budget): planned, spent, remaining and utilization versus completion.
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function BudgetPage() {
  return (
    <>
      <PageHeader
        title="Budget Analytics"
        subtitle="Planned versus spent, per project and per department."
      />
      <ComingSoon message="Per-project and per-department planned, spent, remaining and utilization versus completion will appear here." />
    </>
  );
}

/** Takes no props. */
BudgetPage.propTypes = {};
