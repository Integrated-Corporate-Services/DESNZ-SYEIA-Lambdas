# Case Migration Preflight

Lambda admission service for migration manifests. Deployment artifact: `npm ci; npm run package` produces `preflight-lambda.zip` containing `dist/handler.handler`.

Required environment: `MIGRATION_BUCKET`, `WF1_STATE_MACHINE_ARN`, and `DATABASE_URL`. The Lambda role needs `s3:GetObject`, `s3:HeadObject`, `states:StartExecution`, and database connectivity. It expects the `migration_control` schema supplied by backend migration `V1.28`.