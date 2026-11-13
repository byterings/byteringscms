import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type NextFunction, type Request, type Response } from 'express';
import { getAbsoluteFSPath } from 'swagger-ui-dist';
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

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

export function configureApp(app: NestExpressApplication, env: Env): void {
  // Express 5 defaults to the "simple" query parser; filters use bracket syntax.
  app.set('query parser', 'extended');
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.useBodyParser('json', { limit: env.MAX_JSON_BODY });
  app.use(cookieParser());
  app.useStaticAssets(getAbsoluteFSPath(), { prefix: `/${API_PREFIX}/docs/assets`, index: false });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
}
