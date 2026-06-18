import { envConfig } from '../config/env.config';
import { ssmConfig } from '../config/ssm.config';
import { createLogger } from '../util/logger';
import { LOG_MESSAGES } from '../constants/log.constants';
import { BATCH_SIZE } from '../constants/defaults.constants';
import type { BacsRelayConfig } from '../types';

const log = createLogger('runtimeConfig.service.ts');

const METHOD = {
  LOAD: 'load',
} as const;

class RuntimeConfigService {
  async load(): Promise<BacsRelayConfig> {
    log.start(METHOD.LOAD);

    const env = envConfig.get();
    let batchSize: number = BATCH_SIZE.DEFAULT;

    try {
      const raw = await ssmConfig.getParameter(env.BACS_RELAY_BATCH_SIZE_PARAM);
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        batchSize = Math.min(parsed, BATCH_SIZE.MAX);
      } else {
        log.warn(METHOD.LOAD, LOG_MESSAGES.SSM_PARAMETER_NON_NUMERIC, { raw });
      }
    } catch (err) {
      log.warn(METHOD.LOAD, LOG_MESSAGES.SSM_PARAMETER_LOAD_FAILED, {
        param: env.BACS_RELAY_BATCH_SIZE_PARAM,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    log.end(METHOD.LOAD, { batchSize });
    return { batchSize };
  }
}

export const runtimeConfigService = new RuntimeConfigService();
