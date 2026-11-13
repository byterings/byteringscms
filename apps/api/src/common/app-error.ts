import { HttpStatus } from '@nestjs/common';

/**
 * Domain error with a stable machine-readable code. Services throw these;
 * the global exception filter turns them into the standard error envelope.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(what = 'Resource'): AppError {
    return new AppError('NOT_FOUND', `${what} not found`, HttpStatus.NOT_FOUND);
  }

  static validation(details: unknown, message = 'Validation failed'): AppError {
    return new AppError('VALIDATION_FAILED', message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }

  static badRequest(code: string, message: string, details?: unknown): AppError {
    return new AppError(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthenticated(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppError {
    return new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }

  static conflict(code: string, message: string, details?: unknown): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }
}
