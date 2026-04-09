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
localstack start -d
```

Make sure that AWS APIs are accessible locally:

```sh
export AWS_ENDPOINT_URL="http://localhost:4566"
export AWS_ENDPOINT_URL_S3="http://s3.localhost.localstack.cloud:4566"
```

To deploy infrastructure locally:

```sh
cd infra
rm -rf .terraform*
terraform init -backend-config bucket=coding-workshop-us-east-1-abcd1234
terraform apply -var aws_app_code=abcd1234
```

**Note:** Replace `abcd1234` from above with your participant id shared by workshop organizer(s).

After successful execution, view outputs:

```sh
terraform output
```

### Cloud Deployment

To setup participant environment:

```sh
./bin/setup-participant.sh
```

Make sure that AWS APIs are accessible remotely:

```sh
unset AWS_ENDPOINT_URL
unset AWS_ENDPOINT_URL_S3
```

To deploy your infrastructure to AWS:

```sh
cd infra
rm -rf .terraform*
terraform init -backend-config bucket=coding-workshop-us-east-1-abcd1234
terraform apply -var aws_app_code=abcd1234
```

**Note:** Replace `abcd1234` from above with your participant id shared by workshop organizer(s).

After successful execution, view outputs:

```sh
terraform output
```

### Outputs

| Output          | Description   | Local                                          | Cloud                                           |
| --------------- | ------------- | ---------------------------------------------- | ----------------------------------------------- |
| `api_base_url`  | API Base URL  | *(empty)*                                      | `https://***.cloudfront.net`                    |
| `api_endpoints` | API Endpoints | `{"service-name": "http://***.lambda-url..."}` | `{"service-name": "/api/service-name"}`         |
| `lambda_urls`   | Backend URLs  | `{"service-name": "http://***.lambda-url..."}` | `{"service-name": "https://***.lambda-url..."}` |
| `website_url`   | Frontend URL  | `http://***.s3-website...`                     | `https://***.cloudfront.net`                    |

## Clean Up

To remove all deployed resources:

```sh
./bin/clean-up.sh
```

**Warning**: This removes all infra resources. Cannot be undone.
