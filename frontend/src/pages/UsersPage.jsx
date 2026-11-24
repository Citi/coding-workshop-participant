import ComingSoon from '../components/ComingSoon.jsx';
import PageHeader from '../components/PageHeader.jsx';

/**
 * User administration (route /users, ADMIN only): accounts and role changes.
 * Placeholder until the page is built.
 * @returns {JSX.Element} The page.
 */
export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Manage accounts, roles and departments."
      />
      <ComingSoon message="User management and role changes will appear here." />
    </>
  );
}
