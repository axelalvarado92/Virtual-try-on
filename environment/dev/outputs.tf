output "aws_profile" {
  value       = var.aws_profile
  description = "The AWS profile to use"
}

output "api_url" {
  value       = module.apigateway.api_url
  description = "The URL of the API Gateway"
}
