import { ROLE_LABELS } from '../utils/format';

const NAV = [
  { href: '#/', label: 'Dashboard', match: (p) => p === '/' },
  { href: '#/incidents', label: 'Incidents', match: (p) => p.startsWith('/incidents') && p !== '/incidents/new' },
  { href: '#/incidents/new', label: 'Report incident', match: (p) => p === '/incidents/new' },
];

export default function AppLayout({ user, path, onLogout, children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <a className="topbar-brand" href="#/">
            <span className="brand-mark-sm" aria-hidden="true">A</span>
            <span className="brand-text">ACME Facility Desk</span>
          </a>
          <nav className="topnav" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className={n.match(path) ? 'active' : ''}>
                {n.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="topbar-user">
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className="role-badge">{ROLE_LABELS[user.role] ?? user.role}</span>
          </div>
          <button type="button" className="btn-secondary" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  );
}
