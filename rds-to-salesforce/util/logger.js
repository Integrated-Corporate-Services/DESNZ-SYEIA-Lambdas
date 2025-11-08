import winston from "winston";
import path from "path";
import fs from "fs";

const isCloudEnv = ["prod", "production", "pre-prod", "dev", "staging", "development"].includes(process.env.NODE_ENV);
const logDir = path.resolve(process.cwd(), "logs");

if (!isCloudEnv && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isCloudEnv ? "info" : "debug"),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
    })
  ),
  transports: []
});

if (!isCloudEnv) {
  logger.add(new winston.transports.File({ filename: path.join(logDir, "error.log"), level: "error" }));
  logger.add(new winston.transports.File({ filename: path.join(logDir, "combined.log") }));
}

logger.add(new winston.transports.Console({
  format: isCloudEnv
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
        })
      ),
}));

export default logger;
