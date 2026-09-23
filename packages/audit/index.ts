/**
 * Industrial Brain — Tamper-Evident Audit Engine
 * Phase 1: Core Platform
 */

import crypto from 'crypto';
import { AuditLog } from '../shared/types.ts';

const DEFAULT_AUDIT_SECRET = process.env.AUDIT_HMAC_KEY || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('AUDIT_HMAC_KEY must be configured in production'); })()
  : 'default-audit-hmac-key-dev-only-32bytes');

if (process.env.NODE_ENV === 'production' && DEFAULT_AUDIT_SECRET.length < 32) {
  throw new Error('AUDIT_HMAC_KEY must be at least 32 characters in production');
}

/**
 * Computes a deterministic, tamper-evident HMAC-SHA256 checksum for an audit entry.
 */
export function computeAuditChecksum(
  entry: Omit<AuditLog, 'id' | 'checksum'>,
  secret: string = DEFAULT_AUDIT_SECRET
): string {
  const payloadString = JSON.stringify({
    tenantId: entry.tenantId,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId || '',
    details: entry.details,
    status: entry.status,
    timestamp: entry.timestamp,
  });

  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

/**
 * Validates the cryptographic integrity of an audit record.
 */
export function verifyAuditRecord(
  record: AuditLog,
  secret: string = DEFAULT_AUDIT_SECRET
): boolean {
  const expectedChecksum = computeAuditChecksum(
    {
      tenantId: record.tenantId,
      actorId: record.actorId,
      actorEmail: record.actorEmail,
      actorRole: record.actorRole,
      action: record.action,
      resourceType: record.resourceType,
      resourceId: record.resourceId,
      details: record.details,
      status: record.status,
      timestamp: record.timestamp,
    },
    secret
  );

  return crypto.timingSafeEqual(
    Buffer.from(record.checksum, 'hex'),
    Buffer.from(expectedChecksum, 'hex')
  );
}
