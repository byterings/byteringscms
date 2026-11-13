import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { type Env } from './config/env';

export const API_PREFIX = 'api/v1';

/** Builds a fully configured application. Shared by main.ts and tests. */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    logger: env.LOG_LEVEL === 'silent' ? false : undefined,
    bodyParser: false,
  });
  configureApp(app, env);
  return app;
}

export function configureApp(app: NestExpressApplication, env: Env): void {
  // Express 5 defaults to the "simple" query parser; filters use bracket syntax.
  app.set('query parser', 'extended');
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
}
