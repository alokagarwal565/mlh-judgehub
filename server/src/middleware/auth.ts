import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'mlh-judge-secret-key-change-in-production';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
  activeEventId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      activeEvent?: { id: string; name: string; isActive: boolean } | null;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    
    // Fetch active event and attach to request
    const activeEvent = await prisma.event.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, isActive: true }
    });
    req.activeEvent = activeEvent;
    
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}
