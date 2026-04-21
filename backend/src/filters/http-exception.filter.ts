import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // ValidationPipe returns { message: string[], error, statusCode }
      const body =
        typeof exceptionResponse === 'object'
          ? { ...exceptionResponse }
          : { statusCode: status, message: exceptionResponse };

      if (status >= 400 && status < 500) {
        this.logger.warn(
          { statusCode: status, message: exception.message },
          'Client error',
        );
      }

      response.status(status).json(body);
      return;
    }

    this.logger.error({ err: exception }, 'Unhandled exception');

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
