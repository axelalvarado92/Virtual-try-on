resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = aws_iam_role.this.arn
  handler       = var.handler
  runtime       = "python3.11"
  
  memory_size   = var.memory_size
  timeout       = var.timeout


  filename         = var.filename
  source_code_hash = var.source_code_hash

  layers = var.layers

  environment {
    variables = var.environment_variables
  }
  
}

resource "aws_iam_role" "this" {
    name = "${var.project_name}-${var.environment}-this-role"
    
    assume_role_policy = jsonencode({
        Version = "2012-10-17"
        Statement = [
        {
            Action = "sts:AssumeRole"
            Effect = "Allow"
            Principal = {
            Service = "lambda.amazonaws.com"
            }
        }
        ]
    })
}

data "aws_iam_policy_document" "lambda_policy_doc" {

    statement {
        sid    = "S3TemporaryAccess"
        effect = "Allow"
      
        actions = [
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:PutObject",
        ]
      
        resources = [
          "${var.bucket_arn}/temporary/*"
        ]
    }

    statement {
        sid    = "RekognitionAccess"
        effect = "Allow"
        actions = [
            "rekognition:DetectFaces",
        ]

        resources = [
            "*"
        ]
    }
}

resource "aws_iam_role_policy" "this" {
  name   = "${var.project_name}-${var.environment}-this-policy"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.lambda_policy_doc.json
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
    role       = aws_iam_role.this.name
    policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

}
