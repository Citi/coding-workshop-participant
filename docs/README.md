# Coding Workshop - Main Guide

> **Main Guide** | [Validation Guide](./validation.md) | [Evaluation Guide](./evaluation.md) | [Implementation Guide](./implementation.md) | [Testing Guide](./testing.md)

This folder contains a comprehensive set of documentation to guide you through building a complete web application that meets all specifications and requirements. The goal is to evaluate your effectiveness in delivering a fully working application. Your implementation will be assessed against expected deliverables and milestones.

## Learning Objectives

By completing this workshop, you will:

* [X] Create responsive React applications with Material UI components
* [X] Understand serverless architecture with AWS
* [X] Build RESTful APIs with Python
* [X] Implement CRUD services with AWS Lambda
* [X] Experience NoSQL databases with MongoDB / DocumentDB
* [X] Write comprehensive tests
* [X] Deploy applications to AWS Serverless
* [X] Follow software engineering best practices
* [X] Deliver a production-ready application

## Prerequisites

Before starting, ensure you have:

* Git (v2+)
* Node.js (v16+) with npm
* Python (v3.9+) with pip
* AWS CLI (v2+)
* Terraform (v1+)
* LocalStack (v4+)
* Code Editor (VSCode recommended)
* AWS Account with appropriate permissions

Workshop organizer(s) pre-installed everything on AWS WorkSpaces. Ensure you have:

* Access to pre-installed WorkSpaces instance (e.g., Participant ID, Participant Code, Registration Code)
  * Connect through [WorkSpaces WebUI](https://webclient.amazonworkspaces.com/), or
  * Install and use [WorkSpaces Client](https://clients.amazonworkspaces.com/) on your personal computer / laptop
* Access to pre-installed AWS Serverless environment (e.g., Participant ID, Participant Code, Participant URL)

> NOTE: If you are missing any prerequisites or need help, ask your workshop organizer(s).

## Structure

```
coding-workshop/
├── backend/                 # Python backend
│   ├── achievement/           # CRUD service for achievements
│   ├── individual/            # CRUD service for individuals
│   ├── metadata/              # CRUD service for metadata
│   ├── team/                  # CRUD service for teams
│   └── README.md              # Backend guide
├── bin/                     # Shell scripts
│   ├── clean-up.sh            # Clean up deployment script
│   ├── deploy-backend.sh      # Backend infrastructure deployment script
│   ├── deploy-frontend.sh     # Frontend application deployment script
│   ├── generate-env.sh        # Generate frontend environment script
│   ├── proxy-server.js        # CORS-enabled proxy server script
│   ├── setup-environment.sh   # Setup environment script
│   ├── setup-participant.sh   # Setup participant script
│   ├── start-dev.sh           # Local environment startup script
│   └── README.md              # Shell scripts guide
├── data/                    # Sample CSV data
│   ├── achievement.csv        # Data sample for achievements
│   ├── individual.csv         # Data sample for individuals
│   ├── metadata.csv           # Data sample for metadata
│   ├── team.csv               # Data sample for teams
│   └── README.md              # Data guide
├── docs/                    # Documentation
│   ├── README.md              # Main guide (YOU ARE HERE)
│   ├── evaluation.md          # Evaluation guide
│   ├── implementation.md      # Implementation guide
│   ├── testing.md             # Testing guide
│   └── validation.md          # Validation guide
├── frontend/                # React frontend
│   ├── public/                # Public assets
│   ├── src/                   # Source code
│   ├── package.json           # Application metadata
│   └── README.md              # Frontend guide
└── infra/                   # Terraform infrastructure
    ├── cloudfront.tf          # CloudFront distribution
    ├── data.tf                # Data sources
    ├── documentdb.tf          # DocumentDB serverless cluster
    ├── lambda.tf              # Lambda functions
    ├── locals.tf              # Local values
    ├── main.tf                # Main resources
    ├── output.tf              # Output values
    ├── policy.tftpl           # IAM policy template
    ├── provider.tf            # Provider configurations
    ├── s3.tf                  # S3 bucket
    ├── sgr.tf                 # Security group rules
    ├── variable.tf            # Input variables
    └── README.md              # Infrastructure guide
```

## Next Steps

1. Follow the [Validation Guide](./validation.md) to make sure your development environment includes all prerequisites and requirements.
2. Review the [Evaluation Guide](./evaluation.md) to understand how your implementation will be assessed and evaluated.
3. Check the [Implementation Guide](./implementation.md) to get directions and guidelines on implementation expectations.
4. Explore the [Testing Guide](./testing.md) to make sure your implementation doesn't miss important aspects of development lifecycle.

## Navigation Links

<nav aria-label="breadcrumb">
  <ol>
    <li aria-current="page">Main Guide</li>
    <li><a href="./validation.md">Validation Guide</a></li>
    <li><a href="./evaluation.md">Evaluation Guide</a></li>
    <li><a href="./implementation.md">Implementation Guide</a></li>
    <li><a href="./testing.md">Testing Guide</a></li>
  </ol>
</nav>
