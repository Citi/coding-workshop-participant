output "api_base_url" {
  description = "Base URL for API calls (for frontend REACT_APP_API_URL)"
  value       = data.aws_caller_identity.this.id == "000000000000" ? "" : try("https://${element(aws_cloudfront_distribution.this.*.domain_name, 0)}", "")
}

output "api_endpoints" {
  description = "Available API endpoints by function name"
  value = {
    for name, func in local.function_names :
    func.name => data.aws_caller_identity.this.id == "000000000000" ? module.lambda[name].lambda_function_url : "/api/${func.name}"
  }
}

output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = try(element(aws_cloudfront_distribution.this.*.id, 0), null)
}

output "cloudfront_distribution_url" {
  description = "The URL of the CloudFront distribution"
  value       = try(element(aws_cloudfront_distribution.this.*.domain_name, 0), null)
}

output "lambda_urls" {
  description = "The URLs of the Lambda functions"
  value       = { for name, lambda in module.lambda : lambda.lambda_function_name => lambda.lambda_function_url }
}

output "s3_bucket_id" {
  description = "The ID of the S3 bucket"
  value       = aws_s3_bucket.this.id
}

output "s3_bucket_name" {
  description = "The name of the S3 bucket"
  value       = aws_s3_bucket.this.bucket
}

output "website_url" {
  description = "The URL of the website"
  value       = data.aws_caller_identity.this.id == "000000000000" ? "http://${aws_s3_bucket.this.bucket}.s3-website.localhost.localstack.cloud:4566" : try("https://${element(aws_cloudfront_distribution.this.*.domain_name, 0)}", null)
}
