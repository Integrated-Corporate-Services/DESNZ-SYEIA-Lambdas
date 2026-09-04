# Case Migration Preflight

Lambda admission service for migration manifests. Deploy as a container image; the Lambda handler is `dist/handler.handler`.

Required environment: `MIGRATION_LANDING_BUCKET`, `MIGRATION_STATE_MACHINE_ARN`, `DB_CREDENTIALS`, `HOST_NAME`, and `DB_NAME`. `DB_CREDENTIALS` is the RDS Secrets Manager ARN containing `username` and `password`; `DB_PORT`. The Lambda role needs `s3:GetObject`, `s3:HeadObject`, `states:StartExecution`, `secretsmanager:GetSecretValue`, and database connectivity. It expects the `migration_control` schema supplied by backend migration `V1.28`.