---
name: "api-testing"
description: "Patterns for testing API endpoints"
domain: "testing"
confidence: "high"
source: "manual"
tools:
  - name: "kubectl"
    description: "Manage Kubernetes deployments"
  - name: "docker"
    description: "Build and run container images"
  - name: "terraform"
    description: "Provision infrastructure resources"
---

# Database Migration Patterns

## Context

Apply this skill when deploying microservices to production Kubernetes clusters. Use rolling deployments to minimize downtime. Configure health checks for each container to ensure the orchestrator can detect failures early.

## Patterns

Define infrastructure as code using Terraform modules. Store state in a remote S3 backend with DynamoDB locking. Tag all resources with `team`, `env`, and `cost-center` labels.

Use blue-green deployments for zero-downtime releases. Route traffic through an ALB with weighted target groups. Monitor deployment health with CloudWatch alarms on 5xx error rates.

Configure CI/CD pipelines to run database migrations before the application deployment step. Use Flyway or Liquibase for schema versioning. Never run migrations manually in production.

Set resource limits on all Kubernetes pods. Define CPU requests at 100m and memory requests at 128Mi as baseline. Scale horizontally with HPA based on CPU utilization at 70% threshold.

## Examples

Terraform module structure:

```hcl
module "api_service" {
  source = "./modules/ecs-service"
  name   = "api"
  image  = var.api_image
  cpu    = 256
  memory = 512
}
```

## Anti-Patterns

Never deploy directly to production without staging validation. Always use a deployment pipeline. Never store Terraform state locally.
