import winston from 'winston';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Crear directorio de logs si no existe
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'lightspeed-sync' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Función para serializar objetos evitando referencias circulares
const safeStringify = (obj: any): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
      // Filtrar propiedades problemáticas de objetos de error
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      // Filtrar sockets y otros objetos complejos
      if (value.constructor && ['TLSSocket', 'HTTPParser', 'Socket'].includes(value.constructor.name)) {
        return `[${value.constructor.name}]`;
      }
    }
    return value;
  }, 2);
};

// Si no estamos en producción, también mostrar en consola
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaKeys = Object.keys(meta).filter(key => meta[key] !== undefined);
          if (metaKeys.length > 0) {
            try {
              return `${timestamp} [${level}]: ${message} ${safeStringify(meta)}`;
            } catch (error) {
              // Si aún falla, mostrar solo el mensaje
              return `${timestamp} [${level}]: ${message}`;
            }
          }
          return `${timestamp} [${level}]: ${message}`;
        })
      ),
    })
  );
}

