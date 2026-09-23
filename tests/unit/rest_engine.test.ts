/**
 * Phase 2 Unit Tests: Generic REST Connector & SSRF Protection
 */

import { RestEngine } from '../../packages/connectors/restEngine.ts';

export async function runRestEngineTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      passed++;
      console.log(`  [PASS] ${msg}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${msg}`);
    }
  }

  console.log('\n--- 9. Running Generic REST Connector Unit Tests ---');

  // Test 1: SSRF Protection blocks cloud metadata endpoints
  let ssrfBlocked = false;
  try {
    RestEngine.validateEndpointUrl('http://169.254.169.254/latest/meta-data/');
  } catch (err) {
    ssrfBlocked = (err as Error).message.includes('SSRF Blocked');
  }
  assert(ssrfBlocked, 'SSRF blocked AWS/GCP metadata IP (169.254.169.254)');

  let gcpMetadataBlocked = false;
  try {
    RestEngine.validateEndpointUrl('http://metadata.google.internal/computeMetadata/v1/');
  } catch (err) {
    gcpMetadataBlocked = (err as Error).message.includes('SSRF Blocked');
  }
  assert(gcpMetadataBlocked, 'SSRF blocked GCP metadata hostname');

  // Test 2: SSRF blocks private internal network ranges
  let privateIpBlocked = false;
  try {
    RestEngine.validateEndpointUrl('http://10.0.0.15:8080/api/internal');
  } catch (err) {
    privateIpBlocked = (err as Error).message.includes('SSRF Blocked');
  }
  assert(privateIpBlocked, 'SSRF blocked 10.x.x.x private network IP');

  for (const internalUrl of ['http://127.0.0.1:3000', 'http://localhost:3000', 'http://[::1]:3000']) {
    let blocked = false;
    try {
      RestEngine.validateEndpointUrl(internalUrl);
    } catch (err) {
      blocked = (err as Error).message.includes('SSRF Blocked');
    }
    assert(blocked, `SSRF blocked local endpoint ${internalUrl}`);
  }

  // Test 3: JSONPath extraction
  const nestedApiResponse = {
    status: 'success',
    timestamp: '2026-09-23T10:00:00Z',
    data: {
      factory: 'Stuttgart Plant 1',
      items: [
        { id: 'REC-01', metric: 'vibration', value: 1.2 },
        { id: 'REC-02', metric: 'temperature', value: 78.4 },
      ],
    },
  };

  const extracted = RestEngine.extractRecords(nestedApiResponse, 'data.items');
  assert(extracted.length === 2, 'Extracted 2 records from nested JSONPath (data.items)');
  assert(extracted[0].id === 'REC-01', 'Extracted correct record content');

  // Test 4: Root array extraction
  const rootArray = [
    { code: 'A1', val: 10 },
    { code: 'A2', val: 20 },
  ];
  const rootExtracted = RestEngine.extractRecords(rootArray);
  assert(rootExtracted.length === 2, 'Extracted records from root array directly');

  return { passed, failed };
}
