import type { Pool } from 'pg';
import { rdsSalesforceEventRepository } from '../repositories/rdsSalesforceEvent.repository';
import { salesforceRepository } from '../repositories/salesforce.repository';
import { sqsRepository } from '../repositories/sqs.repository';
import { createLogger } from '../util/logger';
import { 
  RetryableProcessingError, 
  FatalEventError,
  SalesforceRateLimitError,
  SalesforceValidationError,
  isRetryableError 
} from '../errors';
import type { WorkerResult, RdsSalesforceMessage } from '../types';
import { TERMINAL_STATUSES, SALESFORCE_OPERATION } from '../constants';

const logger = createLogger('worker.service');

/**
 * Worker Service
 * Processes RDS events and posts to Salesforce APIs
 */
export class WorkerService {
  /**
   * Apply business logic to post data to Salesforce
   */
  private async postToSalesforce(
    eventId: string,
    tableName: string,
    operation: string,
    data: Record<string, unknown>,
    correlationId: string | null,
  ): Promise<string> {
    logger.info('Worker: posting to Salesforce', {
      eventId,
      tableName,
      operation,
      correlationId,
    });

    // Map database table to Salesforce object type
    const sobjectType = this.mapTableToSalesforceObject(tableName);

    // Transform data payload to Salesforce format
    const salesforceData = this.transformDataForSalesforce(data);

    try {
      let result;

      switch (operation) {
        case SALESFORCE_OPERATION.CREATE:
          result = await salesforceRepository.createObject(sobjectType, salesforceData);
          break;

        case SALESFORCE_OPERATION.UPDATE:
          if (!data.salesforce_id || typeof data.salesforce_id !== 'string') {
            throw new FatalEventError('Missing salesforce_id for UPDATE operation');
          }
          result = await salesforceRepository.updateObject(sobjectType, data.salesforce_id, salesforceData);
          break;

        case SALESFORCE_OPERATION.UPSERT:
          // Use external ID field for upsert
          const externalIdField = this.getExternalIdField(tableName);
          const externalIdValue = String(data[externalIdField]);
          
          if (!externalIdValue) {
            throw new FatalEventError(`Missing external ID field ${externalIdField} for UPSERT`);
          }

          result = await salesforceRepository.upsertObject(
            sobjectType,
            externalIdField,
            externalIdValue,
            salesforceData
          );
          break;

        case SALESFORCE_OPERATION.DELETE:
          if (!data.salesforce_id || typeof data.salesforce_id !== 'string') {
            throw new FatalEventError('Missing salesforce_id for DELETE operation');
          }
          result = await salesforceRepository.deleteObject(sobjectType, data.salesforce_id);
          break;

        default:
          throw new FatalEventError(`Unknown operation type: ${operation}`);
      }

      if (!result.success) {
        throw new FatalEventError(`Salesforce API returned unsuccessful result`);
      }

      logger.info('Worker: Salesforce API call successful', {
        eventId,
        operation,
        salesforceId: result.id,
      });

      return result.id!;
    } catch (error) {
      // Re-throw known error types
      if (
        error instanceof SalesforceRateLimitError ||
        error instanceof SalesforceValidationError ||
        error instanceof FatalEventError
      ) {
        throw error;
      }

      // Wrap unexpected errors
      throw new Error(`Salesforce API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Map database table name to Salesforce object type
   */
  private mapTableToSalesforceObject(tableName: string): string {
    const mapping: Record<string, string> = {
      'users': 'Contact',
      'organisations': 'Account',
      'applications': 'Application__c',
      'payments': 'Payment__c',
      // Add more mappings as needed
    };

    const sobjectType = mapping[tableName.toLowerCase()];
    if (!sobjectType) {
      throw new FatalEventError(`No Salesforce mapping for table: ${tableName}`);
    }

    return sobjectType;
  }

  /**
   * Get external ID field for upsert operations
   */
  private getExternalIdField(tableName: string): string {
    const fieldMapping: Record<string, string> = {
      'users': 'External_User_Id__c',
      'organisations': 'External_Org_Id__c',
      'applications': 'External_App_Id__c',
      'payments': 'External_Payment_Id__c',
      // Add more mappings as needed
    };

    const field = fieldMapping[tableName.toLowerCase()];
    if (!field) {
      throw new FatalEventError(`No external ID field mapping for table: ${tableName}`);
    }

    return field;
  }

  /**
   * Transform database payload to Salesforce format
   */
  private transformDataForSalesforce(data: Record<string, unknown>): Record<string, unknown> {
    // Remove database-specific fields
    const { id, created_at, updated_at, salesforce_id, ...salesforceData } = data;

    // Transform field names (snake_case to camelCase or Salesforce API names)
    const transformed: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(salesforceData)) {
      // Example transformation: first_name -> FirstName
      const transformedKey = key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
      
      transformed[transformedKey] = value;
    }

    return transformed;
  }

  /**
   * Process a single RDS Salesforce event from SQS
   */
  async processEvent(
    message: RdsSalesforceMessage,
    pool: Pool,
  ): Promise<WorkerResult> {
    const repo = rdsSalesforceEventRepository(pool);
    const { eventId, correlationId } = message;

    // Load authoritative event from DB (never trust SQS payload alone)
    const event = await repo.findById(eventId);

    if (!event) {
      throw new FatalEventError(`Event not found in DB: ${eventId}`);
    }

    // Idempotency guard — skip if already in a terminal state
    if ((TERMINAL_STATUSES as readonly string[]).includes(event.processing_status)) {
      logger.info('Worker: event already in terminal state — skipping', {
        eventId,
        correlationId,
        processingStatus: event.processing_status,
      });
      return { eventId, outcome: 'SKIPPED_TERMINAL' };
    }

    // Mark as processing
    await repo.markProcessing(eventId);

    logger.info('Worker: processing event', {
      eventId,
      correlationId,
      recordId: event.record_id,
      tableName: event.table_name,
      operation: event.operation,
    });

    try {
      // Post to Salesforce
      const salesforceId = await this.postToSalesforce(
        eventId,
        event.table_name,
        event.operation,
        event.data_payload,
        correlationId,
      );

      // Mark as processed
      await repo.markProcessed(eventId, salesforceId);

      logger.info('Worker: event processed successfully', {
        eventId,
        correlationId,
        salesforceId,
      });

      return { eventId, outcome: 'PROCESSED' };
    } catch (error) {
      // Check if error is retryable
      if (isRetryableError(error)) {
        const reason = error instanceof Error ? error.message : String(error);

        logger.warn('Worker: retryable error occurred', {
          eventId,
          correlationId,
          error: reason,
        });

        await repo.markRetryableFailure(eventId, reason);

        // Throw so SQS redelivers
        throw new RetryableProcessingError(reason);
      }

      // Non-retryable error - mark as fatal
      if (error instanceof FatalEventError || error instanceof SalesforceValidationError) {
        logger.error('Worker: fatal event detected', {
          eventId,
          correlationId,
          reason: error.message,
        });

        await repo.markFatal(eventId, error.message);

        // Publish to fatal DLQ
        await sqsRepository.publishFatalMessage({
          eventId,
          recordId: event.record_id,
          tableName: event.table_name,
          reason: error.message,
          originalPayload: event.data_payload,
          timestamp: new Date().toISOString(),
        });

        return { eventId, outcome: 'FATAL' };
      }

      // Unknown error - treat as fatal
      const reason = error instanceof Error ? error.message : String(error);

      logger.error('Worker: unexpected error - marking as fatal', {
        eventId,
        correlationId,
        error: reason,
        stack: error instanceof Error ? error.stack : undefined,
      });

      await repo.markFatal(eventId, `Unexpected error: ${reason}`);

      await sqsRepository.publishFatalMessage({
        eventId,
        recordId: event.record_id,
        tableName: event.table_name,
        reason: `Unexpected error: ${reason}`,
        originalPayload: event.data_payload,
        timestamp: new Date().toISOString(),
      });

      return { eventId, outcome: 'FATAL' };
    }
  }
}

export const workerService = new WorkerService();
