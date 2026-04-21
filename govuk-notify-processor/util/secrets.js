/**
 * AWS Secrets Manager Utility
 * 
 * Fetch secrets from AWS Secrets Manager
 * - GOV.UK Notify API key
 * - Database credentials
 * - Other sensitive configuration
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import log from './logger.js';

const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'eu-west-2',
});

/**
 * Get secret value from Secrets Manager
 * @param {string} secretName - Name or ARN of the secret
 * @returns {Promise<string>} - Secret value (string or JSON string)
 */
export async function getSecret(secretName) {
  try {
    log.debug('[secrets] Fetching secret', { secretName });

    const command = new GetSecretValueCommand({
      SecretId: secretName,
    });

    const response = await secretsClient.send(command);

    // Return SecretString (for text/JSON secrets)
    if (response.SecretString) {
      log.info('[secrets] Secret fetched successfully', { secretName });
      return response.SecretString;
    }

    // Return SecretBinary (for binary secrets) - decoded
    if (response.SecretBinary) {
      const buffer = Buffer.from(response.SecretBinary, 'base64');
      return buffer.toString('utf-8');
    }

    throw new Error('Secret has no value');

  } catch (error) {
    log.error('[secrets] Failed to fetch secret', {
      secretName,
      error: error.message,
      errorCode: error.code,
    });

    throw new Error(`Failed to fetch secret ${secretName}: ${error.message}`);
  }
}
