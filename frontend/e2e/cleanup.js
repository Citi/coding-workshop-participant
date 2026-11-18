import { execFileSync } from 'node:child_process';

// Removes everything the e2e suite creates. Uses psql with the local dev
// database settings (override with PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE).
const SQL = `
  DELETE FROM notifications WHERE incident_id IN (SELECT id FROM incidents WHERE title LIKE '[e2e]%');
  DELETE FROM incidents WHERE title LIKE '[e2e]%';
  DELETE FROM users WHERE email LIKE 'e2e.%@acme.inc';
  DELETE FROM buildings WHERE code LIKE 'E2E%';
`;

export function cleanup() {
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', '-c', SQL], {
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST ?? 'localhost',
      PGPORT: process.env.PGPORT ?? '5432',
      PGUSER: process.env.PGUSER ?? 'postgres',
      PGPASSWORD: process.env.PGPASSWORD ?? 'postgres123',
      PGDATABASE: process.env.PGDATABASE ?? 'postgres',
    },
    stdio: 'inherit',
  });
}
