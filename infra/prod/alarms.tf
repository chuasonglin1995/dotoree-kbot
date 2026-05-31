resource "aws_sns_topic" "alerts" {
  name = "${var.project}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Host-level (system/hardware) failure: alert + EC2 auto-recover.
# The 'recover' action is only valid on StatusCheckFailed_System (not the combined metric).
resource "aws_cloudwatch_metric_alarm" "status_check_failed" {
  alarm_name          = "${var.project}-status-check-failed-system"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = aws_instance.kbot.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions = [
    aws_sns_topic.alerts.arn,
    "arn:aws:automate:${var.region}:ec2:recover",
  ]
  ok_actions = [aws_sns_topic.alerts.arn]
}

# Cost guardrail: catch accidental NAT/egress/instance-size surprises.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = "15"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
