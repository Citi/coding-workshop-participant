# Coding Workshop - Infrastructure as Code

## Overview

This folder contains Terraform configurations for managing infrastructure as code.

## Prerequisites

* Terraform >= 1.11
* AWS CLI configured with appropriate credentials
* Required provider versions specified in `provider.tf`

## Structure

```
coding-workshop/
├── backend/               # Python backend
├── bin/                   # Shell scripts
├── data/                  # Sample CSV data
├── docs/                  # Documentation
├── frontend/              # React frontend
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
    ├── s3.tf                # S3 bucket
    ├── sgr.tf               # Security group rules
    ├── variable.tf          # Input variables
    └── README.md            # Infrastructure guide
```

## Usage

### Local Development

Start local environment:

```sh
localstack start -d
```

Deploy infrastructure locally:

```sh
cd infra
rm -rf .terraform*
tflocal init -backend-config bucket=coding-workshop-tfstate-abcd1234
tflocal apply -var aws_app_code=abcd1234
```

> NOTE: Replace `abcd1234` from above with your participant id shared by workshop organizer(s).

After successful execution, view outputs:

```sh
tflocal output
```

### Cloud Deployment

Setup participant environment:

```sh
./bin/setup-participant.sh
```

Deploy infrastructure to AWS:

```sh
cd infra
rm -rf .terraform*
terraform init -backend-config bucket=coding-workshop-tfstate-abcd1234
terraform apply -var aws_app_code=abcd1234
```

> NOTE: Replace `abcd1234` from above with your participant id shared by workshop organizer(s).

After successful execution, view outputs:

```sh
terraform output
```

### Outputs

| Output | Local Value | AWS Value | Description |
|--------|-------------|-----------|-------------|
| `api_base_url` | `""` (empty) | `https://***.cloudfront.net` | Backend URL |
| `api_endpoints` | `{"individual": "http://***.lambda-url..."}` | `{"individual": "/api/individual"}` | Backend Endpoints |
| `lambda_urls` | `{"individual": "http://***.lambda-url..."}` | `{"individual": "https://***.lambda-url..."}` | Lambda URLs |
| `website_url` | `http://***.s3-website...` | `https://***.cloudfront.net` | Frontend URL |

## Clean Up

To remove all deployed resources:

```sh
./bin/clean-up.sh
```

**Warning**: This removes all infra resources. Cannot be undone.
