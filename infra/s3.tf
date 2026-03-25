resource "aws_s3_bucket" "hot_reload" {
  count         = data.aws_caller_identity.this.id == "000000000000" ? 1 : 0
  bucket        = "hot-reload"
  force_destroy = true

  lifecycle {
    prevent_destroy = false
  }
}

resource "aws_s3_bucket" "this" {
  bucket        = format("%s-website-%s", var.aws_project, local.app_id)
  force_destroy = true

  lifecycle {
    prevent_destroy = false
  }

  tags = local.app_tags
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "this" {
  bucket = aws_s3_bucket.this.id
  acl    = "private"

  depends_on = [aws_s3_bucket_ownership_controls.this]
}

# resource "aws_s3_bucket_logging" "this" {
#   bucket        = aws_s3_bucket.this.id
#   target_bucket = var.aws_bucket
#   target_prefix = "s3_website_logs/"
# }

resource "aws_s3_bucket_website_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}
