data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.project}-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# SSM agent: enables Session Manager + Run Command (the access/deploy channel).
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "runtime" {
  statement {
    sid       = "ReadConfigSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.config.arn]
  }

  statement {
    sid       = "DecryptSecrets"
    actions   = ["kms:Decrypt"]
    resources = ["*"] # the AWS-managed Secrets Manager key; scope to a CMK ARN if you create one
  }

  statement {
    sid       = "ReadArtifacts"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }
}

resource "aws_iam_role_policy" "runtime" {
  name   = "${var.project}-runtime"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.runtime.json
}

resource "aws_iam_instance_profile" "kbot" {
  name = "${var.project}-instance"
  role = aws_iam_role.instance.name
}
