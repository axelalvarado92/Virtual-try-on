output "bucket_arn" {
    value = aws_s3_bucket.this.arn
    description = "The ARN of the bucket"
}

output "bucket_name" {
    value = aws_s3_bucket.this.bucket
    description = "The name of the bucket"
}