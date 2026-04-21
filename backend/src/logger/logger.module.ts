import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Request, Response } from 'express';

const isDev = process.env.NODE_ENV !== 'production';
const defaultLevel = isDev ? 'debug' : 'warn';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? defaultLevel,

        // Attach a unique request ID to every log line
        genReqId: (req: Request, res: Response) => {
          const id =
            (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },

        // Redact sensitive headers and body fields
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["set-cookie"]',
            'password',
            'passwordHash',
          ],
          censor: '[REDACTED]',
        },

        // Suppress auto-logging for health/root endpoints
        autoLogging: {
          ignore: (req: Request) => {
            const path = req.url?.split('?')[0];
            return path === '/api/v1/health' || path === '/api/v1';
          },
        },

        // Customize the serialized request object
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },

        // Pretty-print in development, JSON in production
        ...(isDev && {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: false,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          },
        }),
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
