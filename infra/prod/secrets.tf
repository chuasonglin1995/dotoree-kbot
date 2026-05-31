# Declare the parameters in Terraform but NEVER store real values in state.
# Values are populated out-of-band with `aws ssm put-parameter` (see plan Task 10);
# ignore_changes means Terraform won't read or overwrite the real value.
resource "aws_ssm_parameter" "config" {
  for_each = var.ssm_parameters

  name  = "/kbot/prod/${each.key}"
  type  = each.value.secure ? "SecureString" : "String"
  value = "PLACEHOLDER"

  lifecycle {
    ignore_changes = [value]
  }
}
