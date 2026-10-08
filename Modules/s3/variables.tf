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
