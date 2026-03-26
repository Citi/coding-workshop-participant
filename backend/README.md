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
| `IS_LOCAL` | Indicates local vs cloud environment | `true` | `false` |
| `MONGO_HOST` | Mongo database hostname | `host.docker.internal` | AWS DocumentDB endpoint |
| `MONGO_PORT` | Mongo database port | `27017` | `27017` |
| `MONGO_NAME` | Mongo database name | *(not injected)* | *(not injected)* |
| `MONGO_USER` | Mongo database username | *(empty — no auth locally)* | AWS DocumentDB username |
| `MONGO_PASS` | Mongo database password | *(empty — no auth locally)* | AWS DocumentDB password |

> **Connection behavior:** When `IS_LOCAL` is `true`, the connection uses no TLS even if credentials are present (local MongoDB requires auth but not TLS). When `IS_LOCAL` is `false`, TLS is required for DocumentDB.

## Structure

The backend is organized into Lambda functions, one for each CRUD service:

```
coding-workshop-participant/
├── backend/               # Python backend
│   ├── achievements/        # CRUD service for achievements
│   │   ├── function.py        # Contains the Python service with business logic
│   │   └── requirements.txt   # Contains the Python required dependencies
│   ├── individuals/         # CRUD service for individuals
│   │   └── ...                # Similar to the previous service
│   ├── metadata/            # CRUD service for metadata
│   │   └── ...                # Similar to the previous service
│   ├── teams/               # CRUD service for teams
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

To test your code changes:

```sh
# Example: Get all teams
curl -X GET https://localhost:3001/api/teams \
     -H "Content-Type: application/json"
```

To tail logs in real-time:

```sh
# Example: Get logs for teams service
awslocal logs tail /aws/lambda/coding-workshop-teams-abcd1234 \
         --follow --format short --color on
```

### Cloud Deployment

To deploy your backend to AWS:

```sh
./bin/deploy-backend.sh
```

To test your newly deployed code:

```sh
# Example: Get all teams
curl -X GET https://{API_BASE_URL}/api/teams \
     -H "Content-Type: application/json"
```

To tail logs in real-time:

```sh
# Example: Get logs for teams service
aws logs tail /aws/lambda/coding-workshop-teams-abcd1234 \
    --follow --format short --color on
```

## Clean Up

To remove all deployed resources (including backend):

```sh
./bin/clean-up.sh
```

This will remove all AWS resources such as Lambda functions, CloudFront distributions, and much more.

**Warning**: This removes all infra resources. Cannot be undone.
