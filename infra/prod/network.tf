resource "aws_security_group" "kbot" {
  name        = "${var.project}-egress-only"
  description = "Egress-only; no inbound. Access via SSM, not SSH."
  vpc_id      = data.aws_vpc.default.id

  # NOTE: all outbound is allowed (not just 443) on purpose: the box needs DNS
  # (UDP/TCP 53) plus 443 to Telegram/OpenAI/Supabase/SSM/S3 and dnf during
  # bootstrap. Tightening to 53+443 is possible later; the security win here is
  # that there are NO ingress rules at all.
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-egress-only"
  }
}
