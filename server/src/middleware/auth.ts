import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'mlh-judge-secret-key-change-in-production';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'mlh-judge-secret-key-change-in-production')) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET must be configured with a secure value in production.');
}

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

// ponytail: Cache active event for 5s to eliminate redundant DB lookups on high-frequency API routes
let cachedActiveEvent: { id: string; name: string; isActive: boolean } | null = null;
let lastActiveEventFetch = 0;
const ACTIVE_EVENT_CACHE_TTL_MS = 5000;

export async function getActiveEventCached() {
  const now = Date.now();
  if (now - lastActiveEventFetch > ACTIVE_EVENT_CACHE_TTL_MS) {
    cachedActiveEvent = await prisma.event.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, isActive: true }
    });
    lastActiveEventFetch = now;
  }
  return cachedActiveEvent;
}

export function invalidateActiveEventCache() {
  lastActiveEventFetch = 0;
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
    
    // Fetch cached active event and attach to request
    req.activeEvent = await getActiveEventCached();
    
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
