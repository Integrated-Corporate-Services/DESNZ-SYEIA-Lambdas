import { createMigrationPreflightHandler } from './migration-control/migrationPreflight.factory';

// AWS entry point; the factory wires dependencies and the controller handles invocations.
export { createMigrationPreflightHandler };
export const handler = createMigrationPreflightHandler();
