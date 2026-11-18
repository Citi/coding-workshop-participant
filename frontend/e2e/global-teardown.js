import { cleanup } from './cleanup.js';

export default async function globalTeardown() {
  cleanup();
}
