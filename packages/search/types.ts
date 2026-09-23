/**
 * Industrial Brain — Phase 4: Context Engine & Hybrid Search Types
 */

export interface IndustrialDocument {
  id: string;
  tenantId: string;
  title: string;
  docType: 'MANUAL' | 'SOP' | 'MAINTENANCE_LOG' | 'TECH_SPEC' | 'INCIDENT_REPORT';
  sourceFile?: string;
  mimeType?: string;
  content: string;
  metadata: Record<string, unknown>;
  linkedEntityIds: string[]; // Linked Knowledge Graph entity IDs
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  tenantId: string;
  chunkIndex: number;
  content: string;
  sectionHeader?: string;
  isTable: boolean;
  tableData?: string[][];
  errorCodes: string[];       // e.g. ["E-4012", "ERR-HYD-04"]
  technicalSpecs: Record<string, string>; // e.g. { "Max Pressure": "250 bar", "Spindle Speed": "18000 RPM" }
  linkedEntityIds: string[];  // Knowledge Graph nodes linked to this chunk
  embedding?: number[];
  tokenCount: number;
  checksum: string;
  createdAt: string;
}

export interface SearchResultItem {
  chunk: DocumentChunk;
  document: IndustrialDocument;
  bm25Score: number;
  vectorScore: number;
  graphScore: number;
  rrfScore: number; // Reciprocal Rank Fusion combined score
  matchReasons: string[];
}

export interface HybridSearchResult {
  query: string;
  tenantId: string;
  totalHits: number;
  results: SearchResultItem[];
  executionTimeMs: number;
}

export interface AssembledOperationalContext {
  targetEntityId?: string;
  query: string;
  tenantId: string;
  executionTimeMs: number;
  entityDossier?: any;
  relevantChunks: SearchResultItem[];
  connectedGraphNodes: any[];
  assembledPromptContext: string;
}
