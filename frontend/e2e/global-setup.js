import { cleanup } from './cleanup.js';

export default async function globalSetup() {
  const api = process.env.E2E_API_URL ?? 'http://localhost:3001';
  const app = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  for (const [name, url] of [['API', `${api}/api/api-service/health`], ['frontend', app]]) {
    const ok = await fetch(url).then((r) => r.ok, () => false);
    if (!ok) throw new Error(`${name} is not reachable at ${url}. Start the app with ./bin/start-dev.sh first.`);
  }
  cleanup(); // leftovers from an interrupted run
}
