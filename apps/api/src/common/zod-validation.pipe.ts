import { type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';
import { AppError } from './app-error';

/** Validates and parses a request value with a Zod schema from the shared contracts. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw AppError.validation(
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
