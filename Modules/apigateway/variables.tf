variable "project_name" {
    description = "The name of the project"
    type = string
    default = "try-on"
}

variable "environment" {
    description = "The environment for the API Gateway"
    type = string
    default = "dev"
  
}

variable "lambda_invoke_arn" {
    description = "ARN de la función Lambda a integrar con API Gateway"
    type        = string
    default = ""
}

variable "region" {
    description = "The AWS region where the API Gateway is deployed"
    type        = string
}

variable "function_name" {
    description = "The name of the Lambda function to which API Gateway will send requests"
    type        = string
}