# Coding Workshop - Infrastructure as Code

## Overview

This folder contains Terraform configurations for managing infrastructure as code.

## Prerequisites

* Terraform >= 1.11
* AWS CLI configured with appropriate credentials
* Required provider versions specified in `provider.tf`

## Structure

```
coding-workshop-participant/
├── ...
└── infra/                 # Terraform infrastructure
    ├── cloudfront.tf        # CloudFront distribution
    ├── data.tf              # Data sources
    ├── documentdb.tf        # DocumentDB serverless cluster
    ├── lambda.tf            # Lambda functions
    ├── locals.tf            # Local values
    ├── main.tf              # Main resources
    ├── output.tf            # Output values
    ├── policy.tftpl         # IAM policy template
    ├── provider.tf          # Provider configurations
    ├── rds.tf               # Aurora serverless cluster
    ├── s3.tf                # S3 bucket
    ├── variable.tf          # Input variables
    └── README.md            # Infrastructure guide (YOU ARE HERE)
```

## Usage

### Local Development

To run your application locally:

```sh
../bin/start-dev.sh
```

To view your application, open the browser and navigate to `http://localhost:3000`.

### Cloud Deployment

To deploy your backend to AWS:

```sh
../bin/deploy-backend.sh
```

To deploy your frontend to AWS:

```sh
../bin/deploy-frontend.sh
```

To view your application, open the browser and navigate to CloudFront URL.

## Clean Up

To remove all deployed resources:

```sh
../bin/cleanup-environment.sh
```

**Warning**: This removes all infra resources. Cannot be undone.
