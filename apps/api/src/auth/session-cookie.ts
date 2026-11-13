import { type Response } from 'express';
import { cookieSecure, type Env } from '../config/env';

export function setSessionCookie(res: Response, env: Env, token: string, expiresAt: Date): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(env),
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, env: Env): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(env),
    path: '/',
  });
}
