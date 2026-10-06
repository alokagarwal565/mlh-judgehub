import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to enforce active event restriction.
 * Checks if the :eventId route parameter matches the active event.
 * Admins can bypass this for administrative actions.
 */
export function requireActiveEvent(req: Request, res: Response, next: NextFunction): void {
  const eventIdParam = req.params.eventId;
  
  if (!eventIdParam) {
    // No eventId in route, skip check
    next();
    return;
  }

  // If no active event
  if (!req.activeEvent) {
    // Admin can proceed (e.g., to activate an event)
    if (req.user?.role === 'ADMIN') {
      next();
      return;
    }
    // Non-admin cannot access event-specific endpoints
    res.status(403).json({ error: 'No event is currently active. Please contact an administrator.' });
    return;
  }

  // Check if the requested eventId matches the active event
  if (eventIdParam === req.activeEvent.id) {
    // Accessing active event - allowed
    next();
    return;
  }

  // Attempting to access a different event - deny
  res.status(403).json({ error: `Event ${eventIdParam} is not currently active. Active event: ${req.activeEvent.name}` });
}

/**
 * Middleware for admin-only endpoints that can access any event.
 * Still requires authentication and ADMIN role; does not enforce active event.
 */
export function adminEventAccess(req: Request, res: Response, next: NextFunction): void {
  // This is just documentation - actual role check happens via requireRole('ADMIN') middleware
  next();
}
