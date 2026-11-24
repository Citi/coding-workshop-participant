import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * Audit log (route /audit, ADMIN and PM only).
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Every change to business data, newest first."
      />
      <ComingSoon message="The append-only audit trail with entity and actor filters will appear here." />
    </>
  );
}
