"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const env_config_1 = require("./src/config/env.config");
const relay_service_1 = require("./src/services/relay.service");
const logger_1 = require("./src/util/logger");
const log_constants_1 = require("./src/constants/log.constants");
const log = (0, logger_1.createLogger)('handler.ts');
const METHOD = {
    HANDLER: 'handler',
    ENSURE_ENV: 'ensureEnv',
};
let envValidated = false;
function ensureEnv() {
    log.start(METHOD.ENSURE_ENV);
    if (!envValidated) {
        env_config_1.envConfig.load();
        envValidated = true;
    }
    log.end(METHOD.ENSURE_ENV);
}
const handler = async (_event, context) => {
    const correlationId = context?.awsRequestId ?? randomCorrelationId();
    (0, logger_1.setCorrelationId)(correlationId);
    log.start(METHOD.HANDLER);
    log.info(METHOD.HANDLER, log_constants_1.LOG_MESSAGES.HANDLER_INVOCATION_START, {
        functionName: context?.functionName,
        functionVersion: context?.functionVersion,
        remainingMs: context?.getRemainingTimeInMillis?.(),
    });
    try {
        ensureEnv();
        const summary = await relay_service_1.relayService.execute();
        log.info(METHOD.HANDLER, log_constants_1.LOG_MESSAGES.HANDLER_INVOCATION_COMPLETE, summary);
        log.end(METHOD.HANDLER);
        return summary;
    }
    catch (err) {
        log.error(METHOD.HANDLER, log_constants_1.LOG_MESSAGES.HANDLER_INVOCATION_FAILED, {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
        });
        throw err;
    }
    finally {
        (0, logger_1.setCorrelationId)(undefined);
    }
};
exports.handler = handler;
function randomCorrelationId() {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
