# Case Migration Preflight

Lambda admission service for migration manifests. Deploy as a container image; the Lambda handler is `dist/handler.handler`.

Required environment: `MIGRATION_LANDING_BUCKET`, `MIGRATION_STATE_MACHINE_ARN`, `DB_CREDENTIALS`, `HOST_NAME`, and `DB_NAME`. `DB_CREDENTIALS` is the RDS Secrets Manager ARN containing `username` and `password`.

Optional environment: `DB_PORT` (default `5432`), `DB_SCHEMA` (default `migration_control`), `DB_SSL_REJECT_UNAUTHORIZED` (`false` skips RDS certificate verification; `true` enforces it). EIP-dev currently uses `NODE_ENV=development`, which also skips verification so the function can connect to RDS.

The Lambda role needs `s3:GetObject`, `s3:HeadObject`, `states:StartExecution`, `secretsmanager:GetSecretValue`, and database connectivity. It expects the `migration_control` schema supplied by backend migration `V1.28`.
