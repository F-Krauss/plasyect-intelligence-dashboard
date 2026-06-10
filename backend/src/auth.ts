import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import type { Role, UserSession } from './domain.js';
import { defaultUser } from './seed.js';

interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload;
  }
}

export function issueToken(user: UserSession = defaultUser): string {
  return jwt.sign({ email: user.email, role: user.role }, config.JWT_SECRET, {
    subject: user.email,
    expiresIn: '12h',
    issuer: 'plasyect-api',
    audience: 'plasyect-dashboard'
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }

  try {
    req.user = jwt.verify(token, config.JWT_SECRET, {
      issuer: 'plasyect-api',
      audience: 'plasyect-dashboard'
    }) as TokenPayload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
