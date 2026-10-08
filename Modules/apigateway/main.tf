resource "aws_apigatewayv2_api" "http_api" {
    name          = "${var.project_name}-${var.environment}-api"
    protocol_type = "HTTP"

    cors_configuration {
        allow_origins = []

        allow_methods = [
            "POST",
            "OPTIONS"
        ]

        allow_headers = [
            "content-type"
        ]
  
        max_age = 300
    }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                    = aws_apigatewayv2_api.http_api.id
  integration_type          = "AWS_PROXY"
  integration_method        = "POST"
  integration_uri           = var.lambda_invoke_arn
  payload_format_version    = "2.0"

}

resource "aws_apigatewayv2_route" "selfie" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /try-on/session"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_route" "analyze" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /try-on/analyze"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

### Permitir que apigateway invoque lambda ###

data "aws_caller_identity" "current" {}

resource "aws_lambda_permission" "api_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "arn:aws:execute-api:${var.region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.http_api.id}/*/*"
}

