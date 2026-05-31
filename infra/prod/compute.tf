resource "aws_instance" "kbot" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  iam_instance_profile   = aws_iam_instance_profile.kbot.name
  vpc_security_group_ids = [aws_security_group.kbot.id]

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    region          = var.region
    artifact_bucket = aws_s3_bucket.artifacts.id
    project         = var.project
  })

  # Force IMDSv2.
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project}-prod"
  }
}
