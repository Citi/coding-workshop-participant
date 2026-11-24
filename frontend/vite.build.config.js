import { defineConfig, mergeConfig } from 'vite'
import viteConfig from './vite.config.js'

// Production build settings, merged over vite.config.js. They live here so that editing
// them never restarts the running Vite dev server (it restarts on any change to
// vite.config.js); `npm run build`, which bin/deploy-frontend.sh runs, uses this file.

// React and the router: every other chunk imports from this one, and it imports from none.
const REACT_PACKAGES = new Set([
  'react',
  'react-dom',
  'scheduler',
  'react-router',
  'react-router-dom',
  'cookie',
  'set-cookie-parser',
])

// Packages only @mui/x-charts uses: downloaded when the first page with a chart opens.
const CHART_ONLY_PACKAGES = new Set([
  '@base-ui/utils',
  '@floating-ui/utils',
  'bezier-easing',
  'flatqueue',
  'internmap',
  'reselect',
  'use-sync-external-store',
])

/**
 * Package name for a module id inside node_modules (the innermost one when nested).
 * @param {string} id - Module id from Rollup.
 * @returns {string|null} Package name such as `@mui/material`, or null outside node_modules.
 */
function packageOf(id) {
  const path = id.replace(/\\/g, '/')
  const marker = '/node_modules/'
  const index = path.lastIndexOf(marker)
  if (index === -1) {
    return null
  }
  const [scopeOrName, name] = path.slice(index + marker.length).split('/')
  return scopeOrName.startsWith('@') ? `${scopeOrName}/${name}` : scopeOrName
}

/**
 * Split third-party code so no chunk passes Vite's 500 kB warning and the chunks only ever
 * import in one direction (react <- vendor <- charts), which rules out circular chunks.
 * @param {string} id - Module id from Rollup.
 * @returns {string|undefined} Chunk name, or undefined to let Rollup place the module.
 */
function manualChunks(id) {
  // Rollup's CommonJS helpers are imported by the CommonJS packages in every vendor chunk.
  if (id.includes('commonjsHelpers')) {
    return 'react'
  }
  const pkg = packageOf(id)
  if (!pkg) {
    return undefined
  }
  if (REACT_PACKAGES.has(pkg)) {
    return 'react'
  }
  if (pkg.startsWith('@mui/x-') || pkg.startsWith('d3-') || CHART_ONLY_PACKAGES.has(pkg)) {
    return 'charts'
  }
  return 'vendor'
}

export default mergeConfig(
  viteConfig,
  defineConfig({
    build: {
      rollupOptions: {
        output: { manualChunks },
      },
    },
  }),
)
