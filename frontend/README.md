# Coding Workshop - Frontend Code

## Overview

This folder contains React frontend application with hello world example.

## Prerequisites

- React - JavaScript library for building user interfaces
- React Router - Client-side routing for React
- Material UI - Comprehensive UI component library

## Structure

```
coding-workshop-participant/
├── frontend/              # React frontend
│   ├── public/              # Public assets
│   ├── src/                 # Source code
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable components
│   │   ├── services/          # API client
│   │   └── App.js             # Main app
│   ├── .env.sample          # React environment variables
│   ├── eslint.config.js     # ESLint JS tool configuration
│   ├── index.html           # Landing page
│   ├── package.json         # App metadata with dependencies
│   ├── README.md            # Frontend guide (YOU ARE HERE)
│   └── vite.config.js       # Vite build tool configuration
├── ...
```

## Usage

### Local Development

To run your application locally:

```sh
./bin/start-dev.sh
```

To view your application, open the browser and navigate to `http://localhost:3000`.

### Cloud Deployment

To deploy your frontend to AWS:

```sh
./bin/deploy-frontend.sh
```

To view your application, open the browser and navigate to CloudFront URL.

## ACME Project Intelligence Platform notes

### Checks

Run these from `frontend/`:

```sh
npm run lint                    # ESLint, including React hooks rules
npm test                        # Vitest + React Testing Library, with coverage
npm run build                   # production build into dist/
npm audit --audit-level=high    # CI fails on high or critical
```

Build and test settings live in their own files, merged over `vite.config.js`. Vite restarts the
dev server whenever `vite.config.js` changes, so keeping them separate means editing them never
does.

- `vite.build.config.js` is used by `npm run build`, which `bin/deploy-frontend.sh` runs. It splits
  third-party code into `react`, `vendor` and `charts` chunks, so no chunk goes over Vite's 500 kB
  warning. The charts chunk downloads only when a page with a chart opens.
- `vitest.config.js` holds the test settings.

### Deviations from the spec

- **HTML 5xx responses stay server errors (spec 12.2).** The spec says to treat every `text/html`
  API response as 404 `NOT_FOUND`. The client does that for HTML responses with status 200 to 499.
  An HTML 5xx response keeps its status as a server error, and a GET is still retried once after
  3 seconds. The reason: `infra/cloudfront.tf` rewrites only 404 to `/index.html` (status 200),
  while CloudFront's own 502 and 504 error pages are HTML. Treating those as 404 would hide gateway
  errors and skip the retry that waits out an Aurora resume.

## Clean Up

To remove all deployed resources (including frontend):

```sh
./bin/cleanup-environment.sh
```

**Warning**: This removes all infra resources. Cannot be undone.
