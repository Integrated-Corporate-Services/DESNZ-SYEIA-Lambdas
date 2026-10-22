export interface AppConfig {
  migrationBucket: string;
  wf1StateMachineArn: string;
  dbSecretArn: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  migrationPrefixRoot: string;
  manifestFilename: string;
  manifestMaxBytes: number;
  staleAfterSeconds: number;
  dbSchema: string;
  workflowConfig?: Record<string, unknown>;
}
