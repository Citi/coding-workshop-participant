import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Executive dashboard (route /): KPIs, status and risk distribution, budget by department, top risks, recent activity.
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Portfolio status, risk, budget and capacity at a glance."
      />
      <ComingSoon message="KPI tiles, projects by status, risk distribution, planned versus spent by department, top risks and recent activity will appear here." />
    </>
  );
}
