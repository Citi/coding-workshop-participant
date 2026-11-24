import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Projects list (route /projects) with search, filters and a create/edit dialog.
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Search, filter and manage every project in the portfolio."
      />
      <ComingSoon message="A searchable project table with department, status and risk filters will appear here." />
    </>
  );
}
