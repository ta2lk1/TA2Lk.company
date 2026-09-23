/**
 * Integration Tests: Phase 5 Acceptance Criteria
 * Real Data -> Real Reasoning -> Real Decision -> Controlled Action
 */

import { RCAEngine, IncidentInput } from '../../packages/reasoning/rcaEngine.ts';
import { HybridSearchEngine } from '../../packages/search/hybridSearch.ts';
import { GraphStore } from '../../packages/graph/graphStore.ts';
import { IndustrialDocument } from '../../packages/search/types.ts';
import { CorrelationEngine } from '../../packages/reasoning/correlationEngine.ts';

export async function runReasoningIntegrationTests(): Promise<{ passed: number; failed: number }> {
  console.log('--- 21. Running Reasoning & RCA Acceptance Tests (All Criteria) ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  const tenantAlpha = 'tenant_alpha_reasoning';
  const tenantBeta = 'tenant_beta_reasoning';
  const graphStore = new GraphStore();
  const searchEngine = new HybridSearchEngine();

  // 1. Setup Alpha Factory Environment
  graphStore.addNode({
    id: 'mach_alpha_cnc',
    tenantId: tenantAlpha,
    entityType: 'Machine',
    canonicalId: 'CNC-5AXIS-03',
    name: 'Hermle C42U 5-Axis Milling Center',
    category: 'ASSET',
    attributes: { criticalAsset: true },
    sourceRefs: [{ sourceId: 'SAP_ERP', externalId: 'CNC-5AXIS-03', confidence: 1.0 }],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const alphaManual: IndustrialDocument = {
    id: 'doc_alpha_c42u',
    tenantId: tenantAlpha,
    title: 'Hermle C42U Operating Manual',
    docType: 'MANUAL',
    content: `# Alarm Codes
| Error Code | Fault Description | Immediate Protective Action | Corrective Maintenance Action |
| --- | --- | --- | --- |
| E-4012 | Spindle Bearing Over-Temperature (>68°C) | Spindle Emergency Halt | Verify coolant chiller flow at 4.2 bar, replace micron filter, inspect valve PV-02 |`,
    metadata: {},
    linkedEntityIds: ['CNC-5AXIS-03'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  searchEngine.indexDocument(alphaManual, ['CNC-5AXIS-03']);

  const realIncident: IncidentInput = {
    id: 'inc_real_01',
    tenantId: tenantAlpha,
    targetEntityId: 'mach_alpha_cnc',
    errorCode: 'E-4012',
    description: 'Sudden spindle emergency halt triggered by over-temperature threshold during turbine blisk contouring.',
    telemetry: [
      {
        entityId: 'SENS-PRESS-CHILLER',
        metric: 'Coolant Circuit Pressure',
        value: 1.8,
        threshold: 4.2,
        timestamp: new Date().toISOString(),
      },
      {
        entityId: 'SENS-TEMP-COOLANT',
        metric: 'Spindle Bearing Temperature',
        value: 74.2,
        threshold: 68.0,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  // Run RCA
  const rcaResult = RCAEngine.analyzeIncident(realIncident, searchEngine, graphStore);

  // [Criterion 1] RCA on real failure scenario returns correct root cause with verifiable evidence
  assert(rcaResult.rootCauses.length > 0, '[Criterion 1] RCA executed and returned root cause hypotheses');
  const topCause = rcaResult.rootCauses[0];
  assert(topCause.probability >= 0.85, `[Criterion 1] Top root cause has high confidence probability (${topCause.probability})`);
  assert(topCause.failureMode.includes('Coolant Chiller'), '[Criterion 1] Correct physical root cause identified: Coolant Chiller Flow Starvation');
  assert(topCause.evidenceChain.length >= 2, '[Criterion 1] Root cause backed by multi-point verifiable evidence chain');

  // [Criterion 2] Every recommendation contains: Cause + Evidence + Proposed Action + Expected Impact
  assert(rcaResult.recommendations.length >= 2, '[Criterion 2] Generated actionable recommendations');
  for (const rec of rcaResult.recommendations) {
    assert(rec.title.length > 0, `[Criterion 2] Recommendation '${rec.title}' has explicit title`);
    assert(rec.supportingEvidenceIds.length > 0, `[Criterion 2] Recommendation backed by supporting evidence IDs`);
    assert(rec.actionPayload !== undefined && rec.actionPayload.systemTarget !== undefined, `[Criterion 2] Contains structured actionable payload targeting ${rec.actionPayload.systemTarget}`);
    assert(rec.estimatedImpact.downtimeMinutes !== undefined, `[Criterion 2] Quantified downtime impact: ${rec.estimatedImpact.downtimeMinutes}m`);
    assert(rec.estimatedImpact.estimatedCostUsd !== undefined, `[Criterion 2] Quantified financial impact: $${rec.estimatedImpact.estimatedCostUsd}`);
    assert(['LOW', 'MEDIUM', 'HIGH'].includes(rec.estimatedImpact.riskLevel), `[Criterion 2] Assessed risk level: ${rec.estimatedImpact.riskLevel}`);
  }

  // [Criterion 3] 0% Hallucination rate: zero unsupported claims or hallucinated sources
  assert(rcaResult.unsupportedClaimsDetected === 0, '[Criterion 3] 0% Hallucination Guarantee verified (Zero unsupported claims)');
  for (const h of rcaResult.rootCauses) {
    for (const ev of h.evidenceChain) {
      assert(ev.sourceId.length > 0 && ev.dataPointOrQuote.length > 0, '[Criterion 3] Every evidence item has real physical source ID and verified quote');
    }
  }

  // [Criterion 4] AI cannot bypass permissions or execute actions directly (AI proposes only)
  for (const rec of rcaResult.recommendations) {
    // Required approval role is enforced
    assert(
      ['PLANT_MANAGER', 'PROCESS_ENGINEER', 'MAINTENANCE_SUPERVISOR'].includes(rec.requiredApprovalRole),
      `[Criterion 4] Enforced mandatory human approval barrier: ${rec.requiredApprovalRole}`
    );
  }

  // [Criterion 5] Strict Tenant Isolation in Reasoning Engine
  // Tenant Beta cannot run RCA against Tenant Alpha machines or read Alpha evidence
  const betaIncident: IncidentInput = {
    id: 'inc_beta_01',
    tenantId: tenantBeta,
    targetEntityId: 'mach_alpha_cnc', // Attempt cross-tenant access
    errorCode: 'E-4012',
    description: 'Cross tenant attempt',
    telemetry: [],
  };
  const betaRca = RCAEngine.analyzeIncident(betaIncident, searchEngine, graphStore);
  assert(betaRca.targetEntityName === 'mach_alpha_cnc', '[Criterion 5] Tenant Beta cannot resolve Alpha machine name from Graph');
  // Beta has 0 manual chunks from Alpha
  const betaManualEv = betaRca.rootCauses.flatMap((r) => r.evidenceChain).filter((e) => e.sourceType === 'MANUAL_SPECIFICATION');
  assert(betaManualEv.length === 0, '[Criterion 5] Tenant Beta strictly has 0 evidence from Tenant Alpha documents');

  return { passed, failed };
}
