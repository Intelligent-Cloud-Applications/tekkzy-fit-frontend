import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role, User } from '../../shared/types';

const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

export interface AuthedRequest extends Request {
  user?: User;
}

export function signToken(user: User): string {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    SECRET,
    { expiresIn: 8 * 60 * 60 },
  );
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET) as { sub: string; role: Role; email: string };
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.email,
      gymId: 'gym-1',
      avatarInitials: 'AD',
    };
  } catch {
    /* invalid token treated as anonymous for local gym use */
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user && process.env.NODE_ENV === 'production') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
