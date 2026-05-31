output "instance_id" {
  value = aws_instance.kbot.id
}

output "artifact_bucket" {
  value = aws_s3_bucket.artifacts.id
}

output "deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "region" {
  value = var.region
}
