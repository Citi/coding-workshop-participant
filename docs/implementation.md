# Coding Workshop - Implementation Guide

> [Main Guide](./README.md) | [Validation Guide](./validation.md) | [Evaluation Guide](./evaluation.md) | [Testing Guide](./testing.md) | **Implementation Guide**

## Overview

This guide provides directions and guidelines on implementation expectations
but you are free to exercise your creativity to showcase your technical skills
combined with soft skills such as curiosity, observability, and ability to
drive / deliver value.

## Implementation Expectations

### 1. Individuals Management

Individuals represent people employed by the organization.

**Expected Capabilities:**

- [ ] Create new individuals with relevant attributes (name, location, employment type)
- [ ] Retrieve individuals records by ID or list all individuals
- [ ] Update existing individuals records
- [ ] Delete individuals records
- [ ] Handle cases where requested individuals do not exist

**Key Attributes to Consider:**

- Name of the individual
- Work location
- Employment classification (full-time, part-time, contractor)
- Timestamps for tracking record creation and updates

### 2. Teams Management

Teams represent groups of individuals with a designated leader.

**Expected Capabilities:**

- [ ] Create teams with a team leader
- [ ] Ensure team leaders reference valid individuals
- [ ] Retrieve team records with member information
- [ ] Update teams composition and details
- [ ] Delete teams records
- [ ] Validate that referenced members exist

**Key Attributes to Consider:**

- Team name
- Team leader (must be a valid individual)
- Team location
- Team members (collection of individuals)
- Timestamps for tracking record creation and updates

### 3. Achievements Management

Achievements record team accomplishments.

**Expected Capabilities:**

- [ ] Create achievements linked to specific teams
- [ ] Support monthly tracking with appropriate date formatting
- [ ] Retrieve achievements filtered by team or month
- [ ] Update achievements records
- [ ] Delete achievements records
- [ ] Validate that referenced teams exist

**Key Attributes to Consider:**

- Associated team
- Month of achievement (consider YYYY-MM format)
- Description of the achievement
- Optional metrics or quantitative data
- Timestamps for tracking record creation and updates

### 4. Metadata Management

Metadata stores reference data organized by categories for use throughout the application.

**Expected Capabilities:**

- [ ] Create metadata entries within defined categories
- [ ] Retrieve metadata by category or list all metadata
- [ ] Organize metadata logically by category when listing
- [ ] Update metadata entries
- [ ] Delete metadata entries
- [ ] Consider uniqueness constraints for category-key combinations

**Key Attributes to Consider:**

- Category classification (individual, team, organization)
- Key identifier
- Value
- Timestamps for tracking record creation and updates

### 5. Data Validation

Proper validation ensures data integrity and provides helpful feedback to users.

**Expected Capabilities:**

- [ ] Validate required fields are present and non-empty
- [ ] Validate field values meet expected formats and constraints
- [ ] Validate references to other entities exist before accepting
- [ ] Return meaningful error messages for validation failures
- [ ] Handle malformed input gracefully

### 6. Data Persistence

Data should persist reliably and maintain consistency.

**Database Environment Variables:**

Predefined environment variables are injected into each backend service automatically, simplifying the need to manage them manually:

| Variable | Description | Local | Cloud |
|----------|-------------|-------|-------|
| `MONGO_HOST` | Mongo database hostname | `host.docker.internal` | AWS DocumentDB endpoint |
| `MONGO_PORT` | Mongo database port | `27017` | `27017` |
| `MONGO_NAME` | Mongo database default name | `codingworkshop` | `codingworkshop` |
| `MONGO_USER` | Mongo database username | *(empty)* | AWS DocumentDB username |
| `MONGO_PASS` | Mongo database password | *(empty)* | AWS DocumentDB password |

When `MONGO_USER` and `MONGO_PASS` are set, your connection string must include `?tls=true&tlsAllowInvalidCertificates=true&retryWrites=false` as DocumentDB requires TLS and does not support retryable writes.

**Expected Capabilities:**

- [ ] Created records persist in the database
- [ ] Updated records reflect changes accurately
- [ ] Deleted records are properly removed
- [ ] Retrieved records match stored data
- [ ] Database errors are handled appropriately

### 7. API Design

The API should follow RESTful conventions and provide consistent responses.

**Expected Capabilities:**

- [ ] Use appropriate HTTP methods for each operation (POST, GET, PUT, DELETE)
- [ ] Return appropriate HTTP status codes (201 for creation, 200 for success, 204 for deletion, 400 for validation errors, 404 for not found)
- [ ] Return JSON responses for successful operations
- [ ] Return error information in a consistent format
- [ ] Support query parameters for filtering where appropriate

### 8. Frontend User Interface

The frontend should provide an intuitive interface for managing all entities.

**Expected Capabilities:**

- [ ] Display individuals in a tabular format with relevant columns
- [ ] Display teams with leader and member information
- [ ] Display achievements with filtering by team and month
- [ ] Display metadata organized by category
- [ ] Provide create, edit, and delete functionality for all entities
- [ ] Include form validation with helpful error messages
- [ ] Show confirmation dialogs for destructive operations
- [ ] Display loading states during API calls
- [ ] Show success and error notifications
- [ ] Implement responsive design for various screen sizes
- [ ] Provide clear navigation between sections

## API Endpoints Reference

### Individuals Endpoints

| Method | Endpoint            | Description           |
| ------ | ------------------- | --------------------- |
| POST   | `/individuals`      | Create new individual |
| GET    | `/individuals`      | List all individuals  |
| GET    | `/individuals/{id}` | Get individual by ID  |
| PUT    | `/individuals/{id}` | Update individual     |
| DELETE | `/individuals/{id}` | Delete individual     |

### Teams Endpoints

| Method | Endpoint      | Description     |
| ------ | ------------- | --------------- |
| POST   | `/teams`      | Create new team |
| GET    | `/teams`      | List all teams  |
| GET    | `/teams/{id}` | Get team by ID  |
| PUT    | `/teams/{id}` | Update team     |
| DELETE | `/teams/{id}` | Delete team     |

### Achievements Endpoints

| Method | Endpoint             | Description                                            |
| ------ | -------------------- | ------------------------------------------------------ |
| POST   | `/achievements`      | Create new achievement                                 |
| GET    | `/achievements`      | List achievements (supports team_id and month filters) |
| GET    | `/achievements/{id}` | Get achievement by ID                                  |
| PUT    | `/achievements/{id}` | Update achievement                                     |
| DELETE | `/achievements/{id}` | Delete achievement                                     |

### Metadata Endpoints

| Method | Endpoint         | Description                               |
| ------ | ---------------- | ----------------------------------------- |
| POST   | `/metadata`      | Create new metadata entry                 |
| GET    | `/metadata`      | List all metadata (organized by category) |
| GET    | `/metadata/{id}` | Get metadata by ID                        |
| PUT    | `/metadata/{id}` | Update metadata                           |
| DELETE | `/metadata/{id}` | Delete metadata                           |

## Validation Guidelines

**Backend Validation Considerations:**

- [ ] Required fields should be validated before persistence
- [ ] Field values should conform to expected types and formats
- [ ] References to other entities should be verified
- [ ] Duplicate constraints should be enforced where appropriate
- [ ] Error responses should clearly indicate what failed validation

**Frontend Validation Considerations:**

- [ ] Required fields should be indicated visually
- [ ] Validation should occur before form submission
- [ ] Error messages should appear near the relevant field
- [ ] Forms should prevent submission until validation passes
- [ ] Loading states should disable form interaction

## Error Handling Guidelines

### HTTP Status Codes

| Status                    | Usage                                 |
| ------------------------- | ------------------------------------- |
| 200 OK                    | Successful retrieval or update        |
| 201 Created               | Successful creation                   |
| 204 No Content            | Successful deletion                   |
| 400 Bad Request           | Validation error or malformed request |
| 404 Not Found             | Resource not found                    |
| 500 Internal Server Error | Server or database error              |

### Error Handling Expectations

- [ ] API errors should return consistent response structures
- [ ] Frontend should display user-friendly error messages
- [ ] Network errors should be handled gracefully
- [ ] Failed operations should not leave data in inconsistent states

## Navigation Links

<nav aria-label="breadcrumb">
  <ol>
    <li><a href="./README.md">Main Guide</a></li>
    <li><a href="./validation.md">Validation Guide</a></li>
    <li><a href="./evaluation.md">Evaluation Guide</a></li>
    <li><a href="./testing.md">Testing Guide</a></li>
    <li aria-current="page">Implementation Guide</li>
  </ol>
</nav>
