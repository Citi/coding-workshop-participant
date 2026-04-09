# Coding Workshop - Backend Code

## Overview

This folder contains backend services for CRUD operations with examples. Python with PostgreSQL are preferred, but Java and NodeJS with MongoDB options are available.

## Prerequisites

- Compute environment
    - AWS Lambda with Python Runtime and AWS SDK for Python (Boto3)
    - AWS Lambda with NodeJS Runtime and AWS SDK for JavaScript
    - AWS Lambda with Java Runtime and AWS SDK for Java
- Database environment
    - AWS Aurora for PostgreSQL-compatible database
    - AWS DocumentDB for MongoDB-compatible database

Predefined environment variables are injected into each backend service automatically, simplifying the need to manage them manually:

| Variable        | Description           | Local                  | Cloud                   |
| --------------- | --------------------- | ---------------------- | ----------------------- |
| `IS_LOCAL`      | Is it local or cloud? | `true`                 | `false`                 |
| `POSTGRES_HOST` | PostgreSQL hostname   | `localhost`            | AWS Aurora endpoint     |
| `POSTGRES_PORT` | PostgreSQL port       | `5432`                 | `5432`                  |
| `POSTGRES_NAME` | PostgreSQL name       | *(empty)*              | AWS Aurora database     |
| `POSTGRES_USER` | PostgreSQL username   | *(empty)*              | AWS Aurora username     |
| `POSTGRES_PASS` | PostgreSQL password   | *(empty)*              | AWS Aurora password     |
| `MONGO_HOST`    | MongoDB hostname      | `172.17.0.1` (Linux) / `host.docker.internal` (Mac/Windows) | AWS DocumentDB endpoint |
| `MONGO_PORT`.   | MongoDB port          | `27017`                | `27017`                 |
| `MONGO_NAME`    | MongoDB db name       | *(empty)*              | AWS DocumentDB database |
| `MONGO_USER`    | MongoDB username      | *(empty)*              | AWS DocumentDB username |
| `MONGO_PASS`    | MongoDB password      | *(empty)*              | AWS DocumentDB password |

> **Connection behavior:** When `IS_LOCAL` is `true`, the connection uses no TLS even if credentials are present (local MongoDB requires auth but not TLS). When `IS_LOCAL` is `false`, TLS is required for DocumentDB.

## Structure

The backend is organized into Lambda functions, one for each CRUD service:

```
coding-workshop-participant/
├── backend/                             # Backend services
│   ├── _examples/                         # Hello world examples
│   │   ├── java-service/                    # Backend service example for Java developers
│   │   │   ├── src/main/java/com/example/     # Path to Java package
│   │   │   │   ├── Handler.java               # Business logic using Java
│   │   │   │   ├── MongoService.java          # MongoDB connectivity service
│   │   │   │   └── PostgresService.java       # PostgreSQL connectivity service
│   │   │   └── pom.xml                        # Java configuration and dependencies
│   │   ├── nodejs-service/                  # Backend service example for NodeJS developers
│   │   │   ├── eslint.config.js               # ESLint JS tool configuration
│   │   │   ├── index.js                       # Business logic using NodeJS
│   │   │   ├── mongo-service.js               # MongoDB connectivity service
│   │   │   ├── package.json                   # NodeJS configuration and dependencies
│   │   │   └── postgres-service.js            # PostgreSQL connectivity service
│   │   └── python-service/                  # Backend service example for Python developers
│   │       ├── function.py                    # Business logic using Python
│   │       ├── mongo_service.py               # MongoDB connectivity service
│   │       ├── postgres_service.py            # PostgreSQL connectivity service
│   │       └── requirements.txt               # Python configuration and dependencies
│   └── README.md                        # Backend guide (YOU ARE HERE)
├── ...
```

## Adding a New Service

Place your service folder **directly under `backend/`** — one level deep:

```
backend/
├── my-service/          ✓ will be deployed
│   └── function.py
├── _examples/
│   └── my-service/      ✗ will NOT be deployed (underscore prefix)
│       └── function.py
└── group/
    └── my-service/      ✗ will NOT be deployed (too deep)
        └── function.py
```

Terraform auto-discovers services by looking for `function.py` (Python), `package.json` (Node.js), or `pom.xml` (Java) one level under `backend/`. Any folder prefixed with `_` is ignored.

## Usage

### Local Development

To run your application locally:

```sh
./bin/start-dev.sh
```

To test your code changes:

```sh
# Example: Get all records for {{service-name}}
curl -X GET https://localhost:3001/api/{{service-name}} \
     -H "Content-Type: application/json"
```

Replace `{{service-name}}` with corresponding service name
(e.g. `python-service`).

To tail logs in real-time:

```sh
# Example: Get logs for {{service-name}}
AWS_ENDPOINT_URL="http://localhost:4566" \
    aws logs tail /aws/lambda/{{function-name}} \
        --follow --format short --color on
```

Replace `{{function-name}}` with corresponding service name
(e.g. `coding-workshop-python-service-abcd1234`).

### Cloud Deployment

To deploy your backend to AWS:

```sh
./bin/deploy-backend.sh
```

To test your newly deployed code:

```sh
# Example: Get all records for {{service-name}}
curl -X GET https://{API_BASE_URL}/api/{{service-name}} \
     -H "Content-Type: application/json"
```

Replace `{{service-name}}` with corresponding service name
(e.g. `python-service`).

To tail logs in real-time:

```sh
# Example: Get logs for {{service-name}}
aws logs tail /aws/lambda/{{function-name}} \
    --follow --format short --color on
```

Replace `{{function-name}}` with corresponding service name
(e.g. `coding-workshop-python-service-abcd1234`).

## Clean Up

To remove all deployed resources (including backend):

```sh
./bin/clean-up.sh
```

This will remove all AWS resources such as Lambda functions, CloudFront distributions, and much more.

**Warning**: This removes all infra resources. Cannot be undone.
