import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import log from '../util/logger.js';

/**
 * ECS Task Trigger Service
 * Triggers ECS tasks for async payment webhook processing
 * Implements non-blocking pattern with proper task configuration
 */

const ecsClient = new ECSClient({ 
  region: process.env.AWS_REGION || 'eu-west-2' 
});

const ECS_CONFIG = {
  clusterArn: process.env.ECS_CLUSTER_ARN || '',
  taskDefinitionArn: process.env.ECS_WEBHOOK_TASK_DEFINITION || '',
  subnets: (process.env.ECS_SUBNETS || '').split(',').filter(Boolean),
  securityGroups: (process.env.ECS_SECURITY_GROUPS || '').split(',').filter(Boolean),
  launchType: process.env.ECS_LAUNCH_TYPE || 'FARGATE',
  platformVersion: process.env.ECS_PLATFORM_VERSION || 'LATEST',
  enableExecuteCommand: process.env.ECS_ENABLE_EXEC === 'true',
};

/**
 * Trigger ECS task to process webhook asynchronously
 * @param {object} webhookPayload - The validated webhook payload
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} - ECS task execution response
 */
export async function triggerWebhookProcessingTask(webhookPayload, metadata) {
  const { requestId, eventId } = metadata;
  
  log.info('[ECSTaskTrigger] Triggering ECS task for webhook processing', {
    requestId,
    eventId,
    paymentId: webhookPayload.data?.id,
    cluster: ECS_CONFIG.clusterArn,
  });

  // Validate configuration
  if (!ECS_CONFIG.clusterArn || !ECS_CONFIG.taskDefinitionArn) {
    throw new Error('ECS configuration incomplete: missing cluster or task definition ARN');
  }

  if (ECS_CONFIG.launchType === 'FARGATE' && 
      (ECS_CONFIG.subnets.length === 0 || ECS_CONFIG.securityGroups.length === 0)) {
    throw new Error('ECS FARGATE configuration incomplete: missing subnets or security groups');
  }

  try {
    // Prepare task input
    const taskInput = {
      webhook: webhookPayload,
      metadata: {
        requestId,
        eventId,
        triggeredAt: new Date().toISOString(),
        source: 'lambda-webhook-processor',
      },
    };

    // Build RunTask command
    const command = new RunTaskCommand({
      cluster: ECS_CONFIG.clusterArn,
      taskDefinition: ECS_CONFIG.taskDefinitionArn,
      launchType: ECS_CONFIG.launchType,
      platformVersion: ECS_CONFIG.platformVersion,
      enableExecuteCommand: ECS_CONFIG.enableExecuteCommand,
      
      // Network configuration for FARGATE
      ...(ECS_CONFIG.launchType === 'FARGATE' && {
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ECS_CONFIG.subnets,
            securityGroups: ECS_CONFIG.securityGroups,
            assignPublicIp: process.env.ECS_ASSIGN_PUBLIC_IP || 'DISABLED',
          },
        },
      }),
      
      // Container overrides - pass webhook data via environment
      overrides: {
        containerOverrides: [
          {
            name: process.env.ECS_CONTAINER_NAME || 'webhook-processor',
            environment: [
              {
                name: 'WEBHOOK_PAYLOAD',
                value: JSON.stringify(taskInput),
              },
              {
                name: 'REQUEST_ID',
                value: requestId,
              },
              {
                name: 'EVENT_ID',
                value: eventId,
              },
              {
                name: 'PAYMENT_ID',
                value: webhookPayload.data?.id || '',
              },
              {
                name: 'EVENT_TYPE',
                value: webhookPayload.type || '',
              },
            ],
          },
        ],
      },
      
      // Tags for tracking and billing
      tags: [
        {
          key: 'Source',
          value: 'lambda-webhook-processor',
        },
        {
          key: 'RequestId',
          value: requestId,
        },
        {
          key: 'EventId',
          value: eventId,
        },
        {
          key: 'PaymentId',
          value: webhookPayload.data?.id || 'unknown',
        },
      ],
    });

    // Execute task
    const response = await ecsClient.send(command);

    // Check if task was successfully started
    if (response.tasks && response.tasks.length > 0) {
      const task = response.tasks[0];
      log.info('[ECSTaskTrigger] ECS task triggered successfully', {
        requestId,
        eventId,
        taskArn: task.taskArn,
        lastStatus: task.lastStatus,
        desiredStatus: task.desiredStatus,
      });

      return {
        success: true,
        taskArn: task.taskArn,
        taskDefinitionArn: task.taskDefinitionArn,
        lastStatus: task.lastStatus,
        desiredStatus: task.desiredStatus,
      };
    } else if (response.failures && response.failures.length > 0) {
      const failure = response.failures[0];
      throw new Error(`ECS task failed to start: ${failure.reason} - ${failure.detail || ''}`);
    } else {
      throw new Error('ECS task response contains no tasks or failures');
    }

  } catch (err) {
    log.error('[ECSTaskTrigger] Failed to trigger ECS task', {
      requestId,
      eventId,
      error: err.message,
      errorCode: err.code,
      stack: err.stack,
    });

    throw err;
  }
}

/**
 * Trigger ECS task with fallback to direct backend API
 * @param {object} webhookPayload - The validated webhook payload
 * @param {object} metadata - Additional metadata
 * @param {Function} fallbackFn - Fallback function (e.g., REST API call)
 * @returns {Promise<object>} - Processing response
 */
export async function triggerWithFallback(webhookPayload, metadata, fallbackFn) {
  const { requestId, eventId } = metadata;
  
  log.info('[ECSTaskTrigger] Attempting ECS task trigger with fallback', {
    requestId,
    eventId,
  });

  try {
    // Try ECS first
    const result = await triggerWebhookProcessingTask(webhookPayload, metadata);
    
    return {
      method: 'ecs',
      ...result,
    };
    
  } catch (ecsError) {
    log.warn('[ECSTaskTrigger] ECS trigger failed, falling back to direct API', {
      requestId,
      eventId,
      error: ecsError.message,
    });

    try {
      // Fallback to direct REST API
      const fallbackResult = await fallbackFn(webhookPayload, metadata);
      
      return {
        method: 'rest-fallback',
        ...fallbackResult,
      };
      
    } catch (fallbackError) {
      log.error('[ECSTaskTrigger] Both ECS and fallback failed', {
        requestId,
        eventId,
        ecsError: ecsError.message,
        fallbackError: fallbackError.message,
      });

      throw new Error(
        `All processing methods failed. ECS: ${ecsError.message}, Fallback: ${fallbackError.message}`
      );
    }
  }
}

export default {
  triggerWebhookProcessingTask,
  triggerWithFallback,
};
