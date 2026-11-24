import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Resource capacity (route /capacity): peak load, conflict windows and compound bottlenecks.
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function CapacityPage() {
  return (
    <>
      <PageHeader
        title="Resource Capacity"
        subtitle="Peak load, conflict windows and compound bottlenecks for each employee."
      />
      <ComingSoon message="Per-employee peak load and over-allocation windows will appear here." />
    </>
  );
}
