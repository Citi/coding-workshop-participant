# Coding Workshop - Frontend Code

## Overview

This folder contains React frontend application for tracking team members, team locations, monthly team achievements, as well as individual-level and team-level metadata.

## Prerequisites

* React - JavaScript library for building user interfaces
* React Router - Client-side routing for React
* Material UI - Comprehensive UI component library

## Structure

```
coding-workshop/
├── backend/               # Python backend
├── bin/                   # Shell scripts
├── data/                  # Sample CSV data
├── docs/                  # Documentation
├── frontend/              # React frontend
│   ├── public/              # Public assets
│   ├── src/                 # Source code
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable components
│   │   ├── services/          # API client
│   │   └── App.js             # Main app
│   ├── package.json         # App metadata with dependencies
│   └── README.md            # Frontend guide
└── infra/                 # Terraform infrastructure
```

## Usage

### Local Development

Start local environment:

```sh
./bin/start-dev.sh
```

Open the browser and navigate to `http://localhost:3000` (hot-reloading is enabled by default).

### Cloud Deployment

Deploy backend infrastructure to AWS:

```sh
./bin/deploy-frontend.sh
```

Open the browser and navigate to CloudFront URL (the frontend is served via CloudFront with S3 as the origin).

## Clean Up

To remove all frontend resources:

```sh
./bin/clean-up.sh
```

**Warning**: This removes all infra resources. Cannot be undone.
