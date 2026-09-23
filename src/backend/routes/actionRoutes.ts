/**
 * Industrial Brain — Action & Closed-Loop API Routes
 * Phase 6: Action & Closed Loop
 */

import { Router, Response } from 'express';
import { authenticate, enforceTenant, requirePermission, AuthenticatedRequest } from '../middleware/auth.ts';
import { ActionService } from '../../../packages/action/index.ts';
import { MachineOperatingState } from '../../../packages/action/types.ts';
import { db } from '../db/database.ts';

export const actionRouter = Router();

actionRouter.use(authenticate);

/**
 * GET /api/v1/actions/proposals
 * Lists action proposals for current tenant
 */
actionRouter.get(
  '/proposals',
  enforceTenant,
  requirePermission('action:propose'),
  (req: AuthenticatedRequest, res: Response): void => {
    try {
      const proposals = ActionService.getProposalsForTenant(req.tenant!.id);
      res.status(200).json({
        tenantId: req.tenant!.id,
        total: proposals.length,
        proposals,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list proposals', message: (err as Error).message });
    }
  }
);

/**
 * POST /api/v1/actions/proposals/:id/approve
 * Human sign-off on an action proposal
 */
actionRouter.post(
  '/proposals/:id/approve',
  enforceTenant,
  requirePermission('action:approve'),
  (req: AuthenticatedRequest, res: Response): void => {
    try {
      const proposal = ActionService.approveProposal(
        req.params.id,
        req.tenant!.id,
        req.user!.email,
        req.membership!.role
      );

      // Audit log
      db.appendAuditLog({
        tenantId: req.tenant!.id,
        actorId: req.user!.email,
        actorEmail: req.user!.email,
        actorRole: req.membership!.role,
        action: 'ACTION_PROPOSAL_APPROVED',
        resourceType: 'ACTION_ENGINE',
        resourceId: proposal.id,
        details: {
          proposalId: proposal.id,
          title: proposal.title,
          category: proposal.category,
          systemTarget: proposal.systemTarget,
          approvedBy: proposal.approvedBy,
        },
        status: 'SUCCESS',
      });

      res.status(200).json(proposal);
    } catch (err) {
      res.status(400).json({ error: 'Approval Rejected', message: (err as Error).message });
    }
  }
);

/**
 * POST /api/v1/actions/proposals/:id/reject
 * Reject an action proposal
 */
actionRouter.post(
  '/proposals/:id/reject',
  enforceTenant,
  requirePermission('action:approve'),
  (req: AuthenticatedRequest, res: Response): void => {
    try {
      const { reason } = req.body;
      const proposal = ActionService.rejectProposal(
        req.params.id,
        req.tenant!.id,
        req.user!.email,
        reason || 'Rejected by operator'
      );

      db.appendAuditLog({
        tenantId: req.tenant!.id,
        actorId: req.user!.email,
        actorEmail: req.user!.email,
        actorRole: req.membership!.role,
        action: 'ACTION_PROPOSAL_REJECTED',
        resourceType: 'ACTION_ENGINE',
        resourceId: proposal.id,
        details: {
          proposalId: proposal.id,
          reason,
        },
        status: 'SUCCESS',
      });

      res.status(200).json(proposal);
    } catch (err) {
      res.status(400).json({ error: 'Rejection Failed', message: (err as Error).message });
    }
  }
);

/**
 * POST /api/v1/actions/proposals/:id/execute
 * Dispatches an approved action to target enterprise systems
 * strictly guarded by Pre-Execution Guardrails
 */
actionRouter.post(
  '/proposals/:id/execute',
  enforceTenant,
  requirePermission('action:execute'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { customContext } = req.body;

      const result = await ActionService.executeProposal(
        req.params.id,
        req.tenant!.id,
        customContext
      );

      // Audit log every execution attempt
      db.appendAuditLog({
        tenantId: req.tenant!.id,
        actorId: req.user!.email,
        actorEmail: req.user!.email,
        actorRole: req.membership!.role,
        action: result.status === 'SUCCESS' ? 'ACTION_DISPATCHED_SUCCESS' : 'ACTION_GUARDRAIL_BLOCKED',
        resourceType: 'ACTION_DISPATCHER',
        resourceId: result.executionId,
        details: {
          proposalId: result.proposalId,
          systemTarget: result.systemTarget,
          commandType: result.commandType,
          status: result.status,
          externalReferenceId: result.externalReferenceId,
          guardrailsPassed: result.guardrailsEvaluation.canExecute,
          blockedReason: result.guardrailsEvaluation.blockedReason,
          auditChecksum: result.auditChecksum,
        },
        status: result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
      });

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'Execution Error', message: (err as Error).message });
    }
  }
);

/**
 * POST /api/v1/actions/executions/:id/verify-feedback
 * Verifies post-execution sensor readings and automatically triggers rollback if needed
 */
actionRouter.post(
  '/executions/:id/verify-feedback',
  enforceTenant,
  requirePermission('action:execute'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { proposalId, currentSensorValue, elapsedMinutes } = req.body;

      if (currentSensorValue === undefined) {
        res.status(400).json({ error: 'currentSensorValue is required' });
        return;
      }

      const feedback = await ActionService.verifyExecutionFeedback(
        req.params.id,
        proposalId,
        req.tenant!.id,
        Number(currentSensorValue),
        Number(elapsedMinutes || 0)
      );

      // Append feedback verification to audit log
      db.appendAuditLog({
        tenantId: req.tenant!.id,
        actorId: req.user!.email,
        actorEmail: req.user!.email,
        actorRole: req.membership!.role,
        action: feedback.rollbackTriggered ? 'ACTION_AUTOMATIC_ROLLBACK' : 'FEEDBACK_VERIFICATION_EVALUATED',
        resourceType: 'FEEDBACK_LOOP',
        resourceId: feedback.executionId,
        details: {
          executionId: feedback.executionId,
          status: feedback.status,
          isResolved: feedback.isResolved,
          currentValue: feedback.currentSensorValue,
          targetValue: feedback.targetValue,
          rollbackTriggered: feedback.rollbackTriggered,
        },
        status: feedback.isResolved ? 'SUCCESS' : 'FAILURE',
      });

      res.status(200).json(feedback);
    } catch (err) {
      res.status(500).json({ error: 'Feedback Verification Error', message: (err as Error).message });
    }
  }
);

/**
 * POST /api/v1/actions/executions/:id/rollback
 * Manual rollback trigger
 */
actionRouter.post(
  '/executions/:id/rollback',
  enforceTenant,
  requirePermission('action:execute'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { proposalId } = req.body;

      const rollback = await ActionService.triggerManualRollback(
        req.params.id,
        proposalId,
        req.tenant!.id
      );

      db.appendAuditLog({
        tenantId: req.tenant!.id,
        actorId: req.user!.email,
        actorEmail: req.user!.email,
        actorRole: req.membership!.role,
        action: 'ACTION_MANUAL_ROLLBACK',
        resourceType: 'ACTION_DISPATCHER',
        resourceId: rollback.rollbackExecutionId,
        details: {
          originalExecutionId: req.params.id,
          proposalId,
          status: rollback.status,
        },
        status: 'SUCCESS',
      });

      res.status(200).json(rollback);
    } catch (err) {
      res.status(500).json({ error: 'Rollback Error', message: (err as Error).message });
    }
  }
);

/**
 * GET & POST /api/v1/actions/machine-state/:entityId
 * Gets or updates the operational state of a physical asset
 */
actionRouter.get(
  '/machine-state/:entityId',
  enforceTenant,
  requirePermission('knowledge:read'),
  (req: AuthenticatedRequest, res: Response): void => {
    const state = ActionService.getMachineState(req.params.entityId);
    res.status(200).json({ entityId: req.params.entityId, state });
  }
);

actionRouter.post(
  '/machine-state/:entityId',
  enforceTenant,
  requirePermission('action:execute'),
  (req: AuthenticatedRequest, res: Response): void => {
    const { state } = req.body;
    if (!state) {
      res.status(400).json({ error: 'state is required' });
      return;
    }
    ActionService.setMachineState(req.params.entityId, state as MachineOperatingState);
    res.status(200).json({ entityId: req.params.entityId, state });
  }
);
