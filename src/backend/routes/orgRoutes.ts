/**
 * Industrial Brain — Organizations API Routes
 * Phase 1: Core Platform
 */

import { Router, Response } from 'express';
import { db } from '../db/database.ts';
import { authenticate, enforceTenant, requirePermission, AuthenticatedRequest } from '../middleware/auth.ts';
import { SystemRole } from '../../../packages/shared/types.ts';
import { hashPassword } from '../security/auth.ts';

export const orgRouter = Router();

// Protect all organization routes with authentication
orgRouter.use(authenticate);

/**
 * GET /api/v1/organizations
 * Returns list of organizations the authenticated user has access to
 */
orgRouter.get('/', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const orgs = db.listOrganizationsForUser(req.user!.userId);
    res.status(200).json({ organizations: orgs });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', message: (err as Error).message });
  }
});

/**
 * POST /api/v1/organizations
 * Creates a new organization and assigns creator as ORG_ADMIN
 */
orgRouter.post('/', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const { name, slug, settings } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: 'Bad Request', message: 'name and slug are required' });
      return;
    }

    const org = db.createOrganization(name, slug, settings || {});
    const membership = db.createMembership(req.user!.userId, org.id, 'ORG_ADMIN');

    db.appendAuditLog({
      tenantId: org.id,
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      actorRole: 'ORG_ADMIN',
      action: 'ORGANIZATION_CREATED',
      resourceType: 'ORGANIZATION',
      resourceId: org.id,
      details: { name, slug },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS',
    });

    res.status(201).json({
      message: 'Organization created successfully',
      organization: org,
      membership,
    });
  } catch (err) {
    res.status(400).json({ error: 'Creation Error', message: (err as Error).message });
  }
});

/**
 * GET /api/v1/organizations/:tenantId
 * Retrieves detailed tenant configuration (strictly tenant-isolated)
 */
orgRouter.get('/:tenantId', enforceTenant, requirePermission('org:read'), (req: AuthenticatedRequest, res: Response): void => {
  res.status(200).json({ organization: req.tenant });
});

/**
 * GET /api/v1/organizations/:tenantId/members
 * Retrieves all members in the tenant (strictly tenant-isolated)
 */
orgRouter.get('/:tenantId/members', enforceTenant, requirePermission('user:read'), (req: AuthenticatedRequest, res: Response): void => {
  try {
    const members = db.listMembersForTenant(req.tenant!.id);
    res.status(200).json({ members });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', message: (err as Error).message });
  }
});

/**
 * POST /api/v1/organizations/:tenantId/members
 * Adds or updates a member's role within the organization
 */
orgRouter.post('/:tenantId/members', enforceTenant, requirePermission('user:invite'), (req: AuthenticatedRequest, res: Response): void => {
  try {
    const { email, fullName, role } = req.body;

    if (!email || !role) {
      res.status(400).json({ error: 'Bad Request', message: 'email and role are required' });
      return;
    }

    const validRoles: SystemRole[] = [
      'SUPER_ADMIN',
      'ORG_ADMIN',
      'PLANT_MANAGER',
      'PROCESS_ENGINEER',
      'OPERATOR',
      'AUDITOR',
      'VIEWER',
    ];

    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Bad Request', message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      return;
    }

    if (role === 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN cannot be assigned through organization membership invites' });
      return;
    }

    let user = db.getUserByEmail(email);
    if (!user) {
      // Auto-provision user with placeholder password hash
      const { hash, salt } = hashPassword('TempPass123!');
      user = db.createUser(email, fullName || email.split('@')[0], hash, salt, false) as any;
    }

    const membership = db.createMembership(user!.id, req.tenant!.id, role as SystemRole);

    db.appendAuditLog({
      tenantId: req.tenant!.id,
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      actorRole: req.membership!.role,
      action: 'MEMBER_ADDED',
      resourceType: 'MEMBERSHIP',
      resourceId: membership.id,
      details: { targetUserId: user!.id, targetEmail: email, assignedRole: role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'SUCCESS',
    });

    res.status(200).json({
      message: 'Member successfully assigned to organization',
      membership,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error', message: (err as Error).message });
  }
});
