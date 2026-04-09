# Coding Workshop - Testing Guide

> [Main Guide](./README.md) | [Validation Guide](./validation.md) | [Evaluation Guide](./evaluation.md) | **Testing Guide** | [Implementation Guide](./implementation.md)

## Overview

This guide provides comprehensive testing strategies for the coding workshop,
covering backend testing, frontend testing, and performance testing.

### Backend Testing

1. Unit Tests: Test individual Lambda functions in isolation.
2. Integration Tests: Test API endpoints with actual database connections.
3. Error Handling Tests: Test validation and error scenarios for CRUD operations.

### Frontend Testing

1. Component Tests: Test React components using Jest and React Testing Library.
2. API Integration Tests: Test API service functions with mocked responses.
3. End-to-End Tests: Test complete user workflows using tools like Cypress or Selenium.

### Performance Testing

1. Load Testing: Test API endpoints under high concurrent load using tools like Artillery or JMeter.
2. Performance Monitoring: Monitor response times and resource usage to ensure optimal performance.

### Test Coverage Goals

* Backend Components: 80%+ code coverage
* Frontend Components: 80%+ code coverage
* API Endpoints: 90%+ coverage for all CRUD operations
* Error Handling: 90%+ coverage for validation and error cases
* Critical User Paths: 100% E2E test coverage

### Examples: How To Test

#### Local Development

To test your backend changes locally:

```sh
# Example: Get all records for {{service-name}}
curl -X GET https://localhost:3001/api/{{service-name}} \
     -H "Content-Type: application/json"
```

Replace `{{service-name}}` with corresponding service name
(e.g. `python-service`).

To tail backend logs in real-time:

```sh
# Example: Get logs for {{service-name}}
AWS_ENDPOINT_URL="http://localhost:4566" \
    aws logs tail /aws/lambda/{{function-name}} \
        --follow --format short --color on
```

Replace `{{function-name}}` with corresponding service name
(e.g. `coding-workshop-python-service-abcd1234`).

#### Cloud Deployment

To test your backend changes in the cloud:

```sh
# Example: Get all records for {{service-name}}
curl -X GET https://{API_BASE_URL}/api/{{service-name}} \
     -H "Content-Type: application/json"
```

Replace `{{service-name}}` with corresponding service name
(e.g. `python-service`).

To tail backend logs in real-time:

```sh
# Example: Get logs for {{service-name}}
aws logs tail /aws/lambda/{{function-name}} \
    --follow --format short --color on
```

Replace `{{function-name}}` with corresponding service name
(e.g. `coding-workshop-python-service-abcd1234`).

## Navigation Links

<nav aria-label="breadcrumb">
  <ol>
    <li><a href="./README.md">Main Guide</a></li>
    <li><a href="./validation.md">Validation Guide</a></li>
    <li><a href="./evaluation.md">Evaluation Guide</a></li>
    <li aria-current="page">Testing Guide</li>
    <li><a href="./implementation.md">Implementation Guide</a></li>
  </ol>
</nav>
