variable "aws_region" {
  description = "The AWS region to deploy to"
  default     = "us-east-1"

}

variable "environment" {
  description = "The environment to deploy to"
  default     = "dev"
}

variable "business_id" {
  description = "The business ID to deploy to"
  default     = "Fidei"
}

variable "project_name" {
  description = "The project name to deploy to"
  default     = "try-on"
}

variable "bucket_name" {
  description = "The name of the S3 bucket"
  default     = ""
}

variable "force_destroy" {
  description = "Whether to force destroy the S3 bucket"
  default     = false
}

variable "tags" {
  description = "A map of tags to assign to the bucket"
  type        = map(string)
  default     = {}
}

variable "environment_variables" {
  description = "A map of environment variables to assign to the Lambda function"
  type        = map(string)
  default     = {}
}

variable "aws_profile" {
  description = "The AWS profile to use"
  default     = "default"
}

variable "bucket_region" {
  description = "The region where the S3 bucket is located"
  default     = "us-east-1"
}

variable "api_region" {
  description = "The region where the API Gateway is located"
  default     = "us-east-1"
}