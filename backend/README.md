# Coding Workshop - Backend Code

## Overview

This folder contains Python backend services for CRUD operations on Individuals, Teams, Achievements, and Metadata.

## Prerequisites

* Python - Backend language
* Boto3 - AWS SDK for Python
* AWS Lambda - Serverless compute
* AWS DocumentDB - MongoDB-compatible database

## Structure

The backend is organized into Lambda functions, one for each CRUD service:

```
coding-workshop/
├── backend/               # Python backend
│   ├── achievement/         # CRUD service for achievements
│   │   ├── function.py        # Contains the Python service with business logic
│   │   └── requirements.txt   # Contains the Python required dependencies
│   ├── individual/          # CRUD service for individuals
│   │   └── ...                # Similar to the previous service
│   ├── metadata/            # CRUD service for metadata
│   │   └── ...                # Similar to the previous service
│   ├── team/                # CRUD service for teams
│   │   └── ...                # Similar to the previous service
│   └── README.md            # Backend guide
├── bin/                   # Shell scripts
├── data/                  # Sample CSV data
├── docs/                  # Documentation
├── frontend/              # React frontend
└── infra/                 # Terraform infrastructure
```

## Usage

### Local Development

Start local environment:

```sh
./bin/start-dev.sh
```

Make changes and test it:

```sh
# Example: Get all individuals
curl -X GET http://localhost:3001/api/individuals \
     -H "Content-Type: application/json"
```

### Cloud Deployment

Deploy backend infrastructure to AWS:

```sh
./bin/deploy-backend.sh
```

Test newly deployed code:

```sh
# Example: Get all individuals
curl -X GET https://{API_BASE_URL}/api/individuals \
     -H "Content-Type: application/json"
```

## Clean Up

To remove all backend resources:

```sh
./bin/clean-up.sh
```

This will remove all AWS resources such as Lambda functions, CloudFront distributions, and much more.

**Warning**: This removes all infra resources. Cannot be undone.
