/**
 * Industrial Brain — Main Full-Stack Application Server
 * Phase 1: Core Platform
 *
 * Runs Express API server on port 3000 with Vite middleware in development.
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { authRouter } from './src/backend/routes/authRoutes.ts';
import { orgRouter } from './src/backend/routes/orgRoutes.ts';
import { rbacRouter } from './src/backend/routes/rbacRoutes.ts';
import { auditRouter } from './src/backend/routes/auditRoutes.ts';
import { healthRouter } from './src/backend/routes/healthRoutes.ts';
import { openapiRouter } from './src/backend/routes/openapiRoute.ts';
import { connectorRouter } from './src/backend/routes/connectorRoutes.ts';
import { graphRouter } from './src/backend/routes/graphRoutes.ts';
import { searchRouter } from './src/backend/routes/searchRoutes.ts';
import { reasoningRouter } from './src/backend/routes/reasoningRoutes.ts';
import { actionRouter } from './src/backend/routes/actionRoutes.ts';
import { aiRouter } from './src/backend/routes/aiRoutes.ts';
import { db } from './src/backend/db/database.ts';
import { hashPassword } from './src/backend/security/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrapDefaultData() {
  if (process.env.DEMO_MODE !== 'true') {
    return;
  }

  // Ensure default demo organizations and users exist for seamless testing
  const existingAdmin = db.getUserByEmail('admin@industrial-brain.internal');
  if (!existingAdmin) {
    console.log('[Bootstrap] Initializing Phase 1 Default Organizations & Users...');

    // 1. Apex Manufacturing
    const org1 = db.createOrganization('Apex Advanced Manufacturing', 'apex-mfg', {
      industry: 'Automotive & Precision Components',
      location: 'Facility Alpha, Stuttgart',
      tier: 'Enterprise',
    });

    const { hash: adminHash, salt: adminSalt } = hashPassword('AdminPassword123!');
    const adminUser = db.createUser('admin@industrial-brain.internal', 'Dr. Elena Vance (Platform Admin)', adminHash, adminSalt, true);
    db.createMembership(adminUser.id, org1.id, 'ORG_ADMIN');

    const { hash: mgrHash, salt: mgrSalt } = hashPassword('ManagerPassword123!');
    const mgrUser = db.createUser('manager@industrial-brain.internal', 'Marcus Thorne (Plant Manager)', mgrHash, mgrSalt, false);
    db.createMembership(mgrUser.id, org1.id, 'PLANT_MANAGER');

    const { hash: opHash, salt: opSalt } = hashPassword('OperatorPassword123!');
    const opUser = db.createUser('operator@industrial-brain.internal', 'Klaus Weber (Lead Operator)', opHash, opSalt, false);
    db.createMembership(opUser.id, org1.id, 'OPERATOR');

    const { hash: audHash, salt: audSalt } = hashPassword('AuditorPassword123!');
    const audUser = db.createUser('auditor@industrial-brain.internal', 'Sophia Chen (Compliance Auditor)', audHash, audSalt, false);
    db.createMembership(audUser.id, org1.id, 'AUDITOR');

    // 2. Beta Chemical (Isolated Tenant)
    const org2 = db.createOrganization('Beta Chemical Processing', 'beta-chem', {
      industry: 'Specialty Polymers & Solvents',
      location: 'Plant B, Ludwigshafen',
      tier: 'Standard',
    });

    const { hash: betaHash, salt: betaSalt } = hashPassword('BetaPassword123!');
    const betaEngineer = db.createUser('engineer@betachem.internal', 'David Miller (Process Engineer)', betaHash, betaSalt, false);
    db.createMembership(betaEngineer.id, org2.id, 'PROCESS_ENGINEER');

    // Initial audit records
    db.appendAuditLog({
      tenantId: org1.id,
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: 'SUPER_ADMIN',
      action: 'SYSTEM_BOOTSTRAP',
      resourceType: 'PLATFORM',
      resourceId: 'phase_1_core',
      details: { organization: org1.name, status: 'INITIALIZED' },
      ipAddress: '127.0.0.1',
      userAgent: 'System Bootstrapper',
      status: 'SUCCESS',
    });

    db.appendAuditLog({
      tenantId: org2.id,
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: 'SUPER_ADMIN',
      action: 'SYSTEM_BOOTSTRAP',
      resourceType: 'PLATFORM',
      resourceId: 'phase_1_core',
      details: { organization: org2.name, status: 'INITIALIZED' },
      ipAddress: '127.0.0.1',
      userAgent: 'System Bootstrapper',
      status: 'SUCCESS',
    });

    console.log('[Bootstrap] Bootstrap completed successfully.');
  }
}

async function startServer() {
  await bootstrapDefaultData();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON Body parsing with strict limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Security Headers Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Root health probes
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/healthz', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  // Mount API v1 Routers
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/organizations', orgRouter);
  app.use('/api/v1/rbac', rbacRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/v1/connectors', connectorRouter);
  app.use('/api/v1/graph', graphRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/reasoning', reasoningRouter);
  app.use('/api/v1/actions', actionRouter);
  app.use('/api/v1', aiRouter);
  app.use('/api/v1', searchRouter); // For /api/v1/documents
  app.use('/api/v1', healthRouter);
  app.use('/api/v1', openapiRouter);

  // Frontend integration: Static build if dist exists or in production, otherwise Vite middleware
  const distPath = path.resolve(__dirname, 'dist');
  if (process.env.NODE_ENV === 'production' || fs.existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` INDUSTRIAL BRAIN — Operational Intelligence Platform`);
    console.log(` Phase 1: Core Platform Active`);
    console.log(` Server listening on http://0.0.0.0:${PORT}`);
    console.log(` Health check: http://0.0.0.0:${PORT}/api/v1/health`);
    console.log(` OpenAPI Spec: http://0.0.0.0:${PORT}/api/v1/openapi.json`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting Industrial Brain server:', err);
  process.exit(1);
});
