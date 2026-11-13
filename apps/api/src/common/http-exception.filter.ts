import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiError } from '@byteringscms/contracts';
import { Prisma } from '@prisma/client';
import { type Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/** Converts every thrown error into the standard `{ error: { code, message } }` envelope. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<{ id?: string }>();
    const { status, body } = this.toResponse(exception);
    if (status >= 500) {
      // Never send internals to clients; give them an id to quote instead.
      if (request.id) body.error.requestId = String(request.id);
      this.logger.error(
        { requestId: request.id, err: exception },
        exception instanceof Error ? exception.message : String(exception),
      );
    }
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          error: { code: exception.code, message: exception.message, details: exception.details },
        },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            error: { code: 'CONFLICT', message: 'A resource with these values already exists' },
          },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } },
        };
      }
    }
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            details: exception.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res !== null && 'message' in res
            ? String((res as { message: unknown }).message)
            : exception.message;
      return {
        status,
        body: { error: { code: STATUS_CODES[status] ?? 'HTTP_ERROR', message } },
      };
    }
    // Body-parser errors (malformed JSON, oversized payload) carry a status.
    if (typeof exception === 'object' && exception !== null && 'status' in exception) {
      const status = Number((exception as { status: unknown }).status);
      if (status >= 400 && status < 500) {
        return {
          status,
          body: {
            error: {
              code: STATUS_CODES[status] ?? 'BAD_REQUEST',
              message: status === 413 ? 'Request body too large' : 'Malformed request',
            },
          },
        };
      }
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    };
  }
}
