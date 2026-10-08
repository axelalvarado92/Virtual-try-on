###############################################################
#                  s3
###############################################################

module "s3" {
  source = "../../Modules/s3"

  bucket_name   = var.bucket_name
  force_destroy = var.force_destroy
  tags          = var.tags

}

###############################################################
#                  Lambda 
###############################################################

module "lambda-try-on" {
  source = "../../Modules/lambda"

  function_name    = "${var.business_id}-${var.environment}-try-on"
  handler          = "lambda_function.lambda_handler"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  layers           = []

  bucket_arn = module.s3.bucket_arn

  memory_size = 128
  timeout     = 30

  environment_variables = {
    BUCKET_NAME   = var.bucket_name
    BUCKET_REGION = var.bucket_region
  }

}

###############################################################
#                  Lambda Zip
###############################################################

data "archive_file" "lambda_zip" {
  type = "zip"

  source_file = "${path.module}/../../Lambdas/lambda-try-on/lambda_function.py"

  output_path = "${path.module}/../../build/lambda-try-on.zip"
}

###############################################################
#                  Api Gateway
###############################################################

module "apigateway" {
  source = "../../Modules/apigateway"

  lambda_invoke_arn = module.lambda-try-on.lambda_invoke_arn
  region            = var.api_region
  function_name     = module.lambda-try-on.function_name
}
