variable "function_name" {
  description = "The name of the Lambda function"
  type        = string
}

variable "handler" {
  description = "The function within your code that is called when the Lambda function is executed"
  type        = string
}

variable "memory_size" {
  description = "The amount of memory that your Lambda function has available when it runs"
  type        = number
}

variable "timeout" {
  description = "The amount of time that AWS Lambda allows a function to run before stopping it"
  type        = number
}

variable "source_code_hash" {
  description = "The hash of the source code"
  type        = string
}

variable "environment_variables" {
  description = "A map of environment variables for the Lambda function"
  type        = map(string)
}

variable "layers" {
  description = "A list of layers to include in the Lambda function"
  type        = list(string)
}

variable "filename" {
  description = "The path to the deployment package"
  type        = string
}

variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "try-on"
}

variable "environment" {
  description = "The environment (e.g., dev, prod)"
  type        = string
  default     = "dev"
}

variable "bucket_arn" {
  description = "The ARN of the S3 bucket"
  type        = string
}