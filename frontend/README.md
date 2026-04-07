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

## Clean Up

To remove all deployed resources (including frontend):

```sh
./bin/clean-up.sh
```

**Warning**: This removes all infra resources. Cannot be undone.
