# Coding Workshop - Backend Code

## Overview

This folder contains Python backend services for CRUD operations on Individuals, Teams, Achievements, and Metadata.

## Prerequisites

- Python - Backend language
- Boto3 - AWS SDK for Python
- AWS Lambda - Serverless compute
- AWS DocumentDB - MongoDB-compatible database

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
├── ...
```

## Usage

### Local Development

To run your application locally:

```sh
./bin/start-dev.sh
```

### Cloud Deployment

To deploy your backend to AWS:

```sh
./bin/deploy-backend.sh
```

To test your newly deployed code:

```sh
# Example: Get all individuals
curl -X GET https://{API_BASE_URL}/api/individuals \
     -H "Content-Type: application/json"
```

## Clean Up

To remove all deployed resources (including backend):

```sh
./bin/clean-up.sh
```

This will remove all AWS resources such as Lambda functions, CloudFront distributions, and much more.

**Warning**: This removes all infra resources. Cannot be undone.
