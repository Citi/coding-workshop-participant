# Coding Workshop - Backend Code

## Overview

This folder contains Python backend services for CRUD operations on Individuals, Teams, Achievements, and Metadata.

## Prerequisites

- Python - Backend language
- Boto3 - AWS SDK for Python
- AWS Lambda - Serverless compute
- Amazon DocumentDB - MongoDB-compatible database

Predefined environment variables are injected into each backend service automatically, simplifying the need to manage them manually:

| Variable | Description | Local | Cloud |
|----------|-------------|-------|-------|
| `MONGO_HOST` | Mongo database hostname | `host.docker.internal` | AWS DocumentDB endpoint |
| `MONGO_PORT` | Mongo database port | `27017` | `27017` |
| `MONGO_NAME` | Mongo database default name | `codingworkshop` | `codingworkshop` |
| `MONGO_USER` | Mongo database username | *(empty)* | AWS DocumentDB username |
| `MONGO_PASS` | Mongo database password | *(empty)* | AWS DocumentDB password |

## Structure

The backend is organized into Lambda functions, one for each CRUD service:

```
coding-workshop-participant/
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
