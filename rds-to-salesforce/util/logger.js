import winston from "winston";
import path from "path";
import fs from "fs";

const REDACTED_META_KEYS = new Set([
  "request",
  "response",
  "payload",
  "body",
  "headers",
  "rawPayload",
  "raw_payload",
  "requestBody",
  "responseBody",
  "requestHeaders",
  "responseHeaders",
]);

function sanitizeMeta(input, depth = 0) {
  if (depth > 4) return "[MAX_DEPTH]";
  if (input === null || input === undefined) return input;
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((item) => sanitizeMeta(item, depth + 1));

  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACTED_META_KEYS.has(key)) continue;
    sanitized[key] = sanitizeMeta(value, depth + 1);
  }
  return sanitized;
}

const isLocalEnv = process.env.NODE_ENV === "local";
const logDir = path.resolve(process.cwd(), "logs");

if (isLocalEnv && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}


const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const sanitizedMeta = sanitizeMeta(meta);
      return `${timestamp} [${level}] ${message} ${Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta) : ""}`;
    })
  ),
  transports: []
});

if (isLocalEnv) {
  logger.add(new winston.transports.File({ filename: path.join(logDir, "error.log"), level: "error" }));
  logger.add(new winston.transports.File({ filename: path.join(logDir, "combined.log") }));
}

logger.add(new winston.transports.Console({
  format: isLocalEnv
    ? winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const sanitizedMeta = sanitizeMeta(meta);
          return `${timestamp} [${level}] ${message} ${Object.keys(sanitizedMeta).length ? JSON.stringify(sanitizedMeta) : ""}`;
        })
      )
    : winston.format.combine(winston.format.timestamp(), winston.format.json()),
}));

export default logger;
