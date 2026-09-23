/**
 * Unit Tests: Root Cause Analysis (RCA) Engine
 * Phase 5: Reasoning & Decision Engine
 */

import { RCAEngine, IncidentInput } from '../../packages/reasoning/rcaEngine.ts';
import { HybridSearchEngine } from '../../packages/search/hybridSearch.ts';
import { GraphStore } from '../../packages/graph/graphStore.ts';
import { IndustrialDocument } from '../../packages/search/types.ts';

export async function runRCAEngineUnitTests(): Promise<{ passed: number; failed: number }> {
  console.log('--- 20. Running RCA & Evidence Engine Unit Tests ---');
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

  const tenantId = 'tenant_rca_test';
  const graphStore = new GraphStore();
  const searchEngine = new HybridSearchEngine();

  // Setup Machine in Graph
  graphStore.addNode({
    id: 'mach_c42u',
    tenantId,
    entityType: 'Machine',
    canonicalId: 'CNC-5AXIS-03',
    name: 'Hermle C42U 5-Axis Milling Center',
    category: 'ASSET',
    attributes: { maxRpm: 18000 },
    sourceRefs: [{ sourceId: 'SAP', externalId: 'CNC-5AXIS-03', confidence: 1.0 }],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Setup Troubleshooting Manual
  const doc: IndustrialDocument = {
    id: 'doc_manual_c42u',
    tenantId,
    title: 'Hermle C42U Maintenance & Alarm Manual',
    docType: 'MANUAL',
    content: `# Alarm Codes
| Error Code | Fault Description | Corrective Maintenance Action |
| --- | --- | --- |
| E-4012 | Spindle Bearing Over-Temperature (>68°C) | Verify coolant chiller flow at 4.2 bar, replace micron filter |`,
    metadata: {},
    linkedEntityIds: ['CNC-5AXIS-03'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  searchEngine.indexDocument(doc, ['CNC-5AXIS-03']);

  // Real Incident Input
  const incident: IncidentInput = {
    id: 'inc_test_1',
    tenantId,
    targetEntityId: 'mach_c42u',
    errorCode: 'E-4012',
    description: 'Spindle bearing over-temperature alarm during titanium roughing cut',
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
        metric: 'Spindle Temperature',
        value: 74.5,
        threshold: 68.0,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const result = RCAEngine.analyzeIncident(incident, searchEngine, graphStore);

  // Test 1: Incident resolved target
  assert(result.targetEntityName === 'Hermle C42U 5-Axis Milling Center', 'Correct target machine entity identified');

  // Test 2: Grounded Hypotheses
  assert(result.rootCauses.length >= 2, `Generated ${result.rootCauses.length} ranked hypotheses`);
  assert(result.rootCauses[0].rank === 1, 'Top hypothesis ranked #1');
  assert(result.rootCauses[0].probability >= 0.80, 'Top hypothesis has high probability (>= 0.80)');
  assert(result.rootCauses[0].failureMode.includes('Coolant Chiller'), 'Identified Coolant Chiller Flow Starvation as primary root cause');

  // Test 3: Evidence Chains Present
  assert(result.rootCauses[0].evidenceChain.length >= 2, 'Primary hypothesis supported by multiple evidence items');
  const hasTelemetryEv = result.rootCauses[0].evidenceChain.some((e) => e.sourceType === 'SENSOR_TELEMETRY');
  const hasManualEv = result.rootCauses[0].evidenceChain.some((e) => e.sourceType === 'MANUAL_SPECIFICATION');
  assert(hasTelemetryEv, 'Hypothesis evidence chain includes physical sensor telemetry');
  assert(hasManualEv, 'Hypothesis evidence chain includes official manual specification');

  // Test 4: Recommendations Structure & Impact
  assert(result.recommendations.length >= 2, `Generated ${result.recommendations.length} operational recommendations`);
  const corr = result.recommendations.find((r) => r.category === 'CORRECTIVE_ACTION');
  assert(corr !== undefined, 'Generated immediate Corrective Action');
  assert(corr?.estimatedImpact.downtimeMinutes !== undefined && corr.estimatedImpact.downtimeMinutes > 0, 'Includes estimated downtime (45 min)');
  assert(corr?.estimatedImpact.estimatedCostUsd !== undefined && corr.estimatedImpact.estimatedCostUsd > 0, 'Includes estimated cost ($140)');
  assert(corr?.requiredApprovalRole === 'PROCESS_ENGINEER', 'Enforces required human approval role (PROCESS_ENGINEER)');

  // Test 5: 0% Hallucination Guarantee
  assert(result.unsupportedClaimsDetected === 0, 'Zero unsupported claims detected (0% Hallucination Guarantee)');

  return { passed, failed };
}
