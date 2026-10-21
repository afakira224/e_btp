import winston from "winston";

const { combine, timestamp, colorize, printf, errors } = winston.format;

const ICONS: Record<string, string> = {
  error:   "❌",
  warn:    "⚠️ ",
  info:    "✅",
  http:    "🌐",
  verbose: "🔍",
  debug:   "🐛",
  silly:   "🎉",
};

const logFormat = printf(({ level, message, timestamp, stack }) => {
  const icon = ICONS[level] ?? "📋";
  return `[${timestamp}] ${icon}  ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        logFormat
      ),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

export default logger;