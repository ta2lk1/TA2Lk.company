/**
 * Industrial Brain — Multi-Tenant & RBAC Middlewares
 * Phase 1: Core Platform
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../security/auth.ts';
import { db } from '../db/database.ts';
import { Organization, Membership, Permission, SystemRole } from '../../../packages/shared/types.ts';
import { hasPermission } from '../../../packages/shared/rbac.ts';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  tenant?: Organization;
  membership?: Membership;
}

/**
 * Validates JWT Bearer authorization header.
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = verifyToken(token);
    const user = db.getUserById(payload.userId);
    if (!user || !user.isActive) {
      throw new Error('User account is inactive or no longer exists');
    }
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized', message: (err as Error).message });
    return;
  }
}

/**
 * Enforces strict multi-tenant isolation.
 * Resolves tenant from header 'X-Tenant-ID' or token payload.
 * Strictly verifies user has an active membership in the target tenant.
 */
export function enforceTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required prior to tenant resolution' });
    return;
  }

  const requestedTenantId =
    (req.headers['x-tenant-id'] as string) ||
    req.user.activeTenantId ||
    (req.query.tenantId as string);

  if (!requestedTenantId) {
    res.status(400).json({ error: 'Bad Request', message: 'Tenant identifier is required (via X-Tenant-ID header or token)' });
    return;
  }

  const org = db.getOrganization(requestedTenantId);
  if (!org) {
    res.status(404).json({ error: 'Tenant Not Found', message: `Organization ${requestedTenantId} does not exist` });
    return;
  }

  // SuperAdmin has platform-wide visibility, otherwise verify tenant membership
  if (!req.user.isSuperAdmin) {
    const membership = db.getMembership(req.user.userId, requestedTenantId);
    if (!membership || membership.status !== 'ACTIVE') {
      // Record blocked unauthorized cross-tenant access in audit log
      db.appendAuditLog({
        tenantId: requestedTenantId,
        actorId: req.user.userId,
        actorEmail: req.user.email,
        actorRole: 'UNKNOWN',
        action: 'TENANT_ACCESS_DENIED',
        resourceType: 'ORGANIZATION',
        resourceId: requestedTenantId,
        details: { reason: 'No active membership in tenant', ip: req.ip },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'BLOCKED',
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'Strict Tenant Isolation: Access denied to target organization',
      });
      return;
    }
    req.membership = membership;
  } else {
    // SuperAdmin synthesized membership
    req.membership = {
      id: 'super_admin_membership',
      userId: req.user.userId,
      tenantId: requestedTenantId,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  req.tenant = org;
  next();
}

/**
 * Granular RBAC permission check.
 */
export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.membership) {
      res.status(403).json({ error: 'Forbidden', message: 'Tenant membership not resolved' });
      return;
    }

    const role = req.membership.role as SystemRole;
    if (!hasPermission(role, permission)) {
      // Record unauthorized permission access in audit log
      if (req.tenant && req.user) {
        db.appendAuditLog({
          tenantId: req.tenant.id,
          actorId: req.user.userId,
          actorEmail: req.user.email,
          actorRole: role,
          action: 'PERMISSION_DENIED',
          resourceType: 'RBAC',
          resourceId: permission,
          details: { requiredPermission: permission, userRole: role },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          status: 'BLOCKED',
        });
      }

      res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient privileges: Role '${role}' lacks permission '${permission}'`,
      });
      return;
    }

    next();
  };
}
