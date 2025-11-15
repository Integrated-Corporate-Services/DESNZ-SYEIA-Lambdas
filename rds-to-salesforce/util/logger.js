import winston from "winston";
import path from "path";
import fs from "fs";

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
      return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
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
          return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
        })
      )
    : winston.format.combine(winston.format.timestamp(), winston.format.json()),
}));

export default logger;
