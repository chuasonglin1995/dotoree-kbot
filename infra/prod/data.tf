data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

# Latest Amazon Linux 2023 arm64 AMI, resolved at plan time from the public SSM parameter.
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}
