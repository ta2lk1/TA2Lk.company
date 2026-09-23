/**
 * Industrial Brain — Client API Service
 * Interacts with /api/v1/* endpoints
 */

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface MemberInfo {
  id: string;
  userId: string;
  tenantId: string;
  role: string;
  status: string;
  userEmail?: string;
  userFullName?: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  timestamp: string;
  checksum: string;
  integrityVerified?: boolean;
}

class ApiService {
  private token: string | null = localStorage.getItem('ib_token');
  private activeTenantId: string | null = localStorage.getItem('ib_tenant_id');

  public getToken(): string | null {
    return this.token;
  }

  public getActiveTenantId(): string | null {
    return this.activeTenantId;
  }

  public setAuth(token: string, tenantId?: string) {
    this.token = token;
    localStorage.setItem('ib_token', token);
    if (tenantId) {
      this.activeTenantId = tenantId;
      localStorage.setItem('ib_tenant_id', tenantId);
    }
  }

  public setActiveTenant(tenantId: string) {
    this.activeTenantId = tenantId;
    localStorage.setItem('ib_tenant_id', tenantId);
  }

  public clearAuth() {
    this.token = null;
    this.activeTenantId = null;
    localStorage.removeItem('ib_token');
    localStorage.removeItem('ib_tenant_id');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.activeTenantId) {
      headers['X-Tenant-ID'] = this.activeTenantId;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(errBody.message || errBody.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // Auth
  public async login(email: string, password: string) {
    const res = await this.request<{
      token: string;
      user: UserProfile;
      activeTenantId?: string;
      activeRole: string;
      permissions: string[];
      organizations: Array<{ tenantId: string; organizationName: string; role: string }>;
    }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setAuth(res.token, res.activeTenantId);
    return res;
  }

  public async register(email: string, password: string, fullName: string, organizationName: string, organizationSlug?: string) {
    const res = await this.request<{
      token: string;
      user: UserProfile;
      activeTenant: OrganizationInfo;
      activeRole: string;
      permissions: string[];
      organizations: Array<{ tenantId: string; organizationName: string; role: string }>;
    }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, organizationName, organizationSlug }),
    });
    this.setAuth(res.token, res.activeTenant.id);
    return res;
  }

  public async getMe() {
    return this.request<{
      user: UserProfile;
      activeTenant: OrganizationInfo | null;
      activeRole: string;
      permissions: string[];
      organizations: Array<{ tenantId: string; organizationName: string; role: string }>;
    }>('/api/v1/auth/me');
  }

  public async switchTenant(tenantId: string) {
    const res = await this.request<{
      token: string;
      activeTenant: OrganizationInfo;
      activeRole: string;
      permissions: string[];
    }>('/api/v1/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
    this.setAuth(res.token, res.activeTenant.id);
    return res;
  }

  // Organizations
  public async listOrganizations() {
    return this.request<{
      organizations: Array<{ tenantId: string; organizationName: string; role: string }>;
    }>('/api/v1/organizations');
  }

  public async createOrganization(name: string, slug: string, settings?: Record<string, unknown>) {
    return this.request<{
      message: string;
      organization: OrganizationInfo;
    }>('/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, slug, settings }),
    });
  }

  public async getOrganization(tenantId: string) {
    return this.request<{ organization: OrganizationInfo }>(`/api/v1/organizations/${tenantId}`);
  }

  public async getOrganizationMembers(tenantId: string) {
    return this.request<{ members: MemberInfo[] }>(`/api/v1/organizations/${tenantId}/members`);
  }

  public async addOrganizationMember(tenantId: string, email: string, fullName: string, role: string) {
    return this.request<{ message: string; membership: MemberInfo }>(`/api/v1/organizations/${tenantId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, fullName, role }),
    });
  }

  // RBAC
  public async getRoles() {
    return this.request<{
      roles: Array<{ role: string; permissions: string[]; description: string }>;
    }>('/api/v1/rbac/roles');
  }

  public async getPermissions() {
    return this.request<{
      permissions: Array<{ id: string; category: string; description: string }>;
    }>('/api/v1/rbac/permissions');
  }

  // Audit
  public async getAuditLogs(params?: { actorId?: string; action?: string; status?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.actorId) query.set('actorId', params.actorId);
    if (params?.action) query.set('action', params.action);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', params.limit.toString());

    return this.request<{
      tenantId: string;
      total: number;
      logs: AuditLogItem[];
    }>(`/api/v1/audit/logs?${query.toString()}`);
  }

  public async verifyAuditIntegrity() {
    return this.request<{
      tenantId: string;
      recordsChecked: number;
      validRecords: number;
      tamperedRecords: number;
      isChainIntact: boolean;
      corruptedIds: string[];
    }>('/api/v1/audit/verify', { method: 'POST' });
  }

  public async exportAuditPackage() {
    return this.request<any>('/api/v1/audit/export', { method: 'POST' });
  }

  // Phase 2: Connectors & Ingestion Pipeline
  public async getDataSources() {
    return this.request<{ dataSources: any[] }>('/api/v1/connectors/datasources');
  }

  public async createDataSource(name: string, type: string, config?: Record<string, unknown>) {
    return this.request<{ dataSource: any }>('/api/v1/connectors/datasources', {
      method: 'POST',
      body: JSON.stringify({ name, type, config }),
    });
  }

  public async previewCsv(csvContent: string) {
    return this.request<{ preview: any }>('/api/v1/connectors/csv/preview', {
      method: 'POST',
      body: JSON.stringify({ csvContent }),
    });
  }

  public async ingestCsv(
    csvContent: string,
    options?: { dataSourceId?: string; entityType?: string; externalIdColumn?: string; enableDeduplication?: boolean }
  ) {
    return this.request<any>('/api/v1/connectors/csv/ingest', {
      method: 'POST',
      body: JSON.stringify({ csvContent, ...options }),
    });
  }

  public async inspectXlsx(base64Data: string) {
    return this.request<{ inspection: any }>('/api/v1/connectors/xlsx/inspect', {
      method: 'POST',
      body: JSON.stringify({ base64Data }),
    });
  }

  public async ingestXlsx(
    base64Data: string,
    sheetName?: string,
    options?: { dataSourceId?: string; entityType?: string; externalIdColumn?: string; enableDeduplication?: boolean }
  ) {
    return this.request<any>('/api/v1/connectors/xlsx/ingest', {
      method: 'POST',
      body: JSON.stringify({ base64Data, sheetName, ...options }),
    });
  }

  public async testPostgres(config?: any) {
    return this.request<any>('/api/v1/connectors/postgres/test', {
      method: 'POST',
      body: JSON.stringify({ config }),
    });
  }

  public async syncPostgres(
    tableName: string,
    options?: { timestampColumn?: string; lastSyncTimestamp?: string; limit?: number; dataSourceId?: string; entityType?: string }
  ) {
    return this.request<any>('/api/v1/connectors/postgres/sync', {
      method: 'POST',
      body: JSON.stringify({ tableName, ...options }),
    });
  }

  public async testRest(config: { endpointUrl: string; method?: string; headers?: Record<string, string>; authType?: string; authKey?: string; authValue?: string; recordsJsonPath?: string }) {
    return this.request<any>('/api/v1/connectors/rest/test', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  public async syncRest(config: any) {
    return this.request<any>('/api/v1/connectors/rest/sync', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  public async getNormalizedRecords(params?: { entityType?: string; dataSourceId?: string; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.dataSourceId) query.set('dataSourceId', params.dataSourceId);
    if (params?.limit) query.set('limit', params.limit.toString());

    return this.request<{ tenantId: string; total: number; records: any[] }>(`/api/v1/connectors/records?${query.toString()}`);
  }

  public async getIngestionJobs() {
    return this.request<{ jobs: any[] }>('/api/v1/connectors/jobs');
  }

  public async getDeadLetterQueue() {
    return this.request<{ deadLetterItems: any[] }>('/api/v1/connectors/dlq');
  }

  public async resolveDeadLetterItem(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/v1/connectors/dlq/${id}/resolve`, {
      method: 'POST',
    });
  }

  // Phase 3: Knowledge Graph & Entity Resolution
  public async getGraphNodes(entityType?: string) {
    const query = entityType ? `?entityType=${entityType}` : '';
    return this.request<{ tenantId: string; total: number; nodes: any[] }>(`/api/v1/graph/nodes${query}`);
  }

  public async createGraphNode(nodeData: {
    canonicalId: string;
    name: string;
    entityType: string;
    category: string;
    attributes?: Record<string, unknown>;
    description?: string;
  }) {
    return this.request<any>('/api/v1/graph/nodes', {
      method: 'POST',
      body: JSON.stringify(nodeData),
    });
  }

  public async createGraphEdge(edgeData: {
    sourceId: string;
    targetId: string;
    relationType: string;
    properties?: Record<string, unknown>;
    confidence?: number;
    validFrom?: string;
    validTo?: string | null;
  }) {
    return this.request<any>('/api/v1/graph/edges', {
      method: 'POST',
      body: JSON.stringify(edgeData),
    });
  }

  public async getEntityContext(nodeId: string) {
    return this.request<any>(`/api/v1/graph/nodes/${nodeId}/context`);
  }

  public async traverseGraph(params: { nodeId: string; direction?: string; maxDepth?: number }) {
    const query = new URLSearchParams();
    query.set('nodeId', params.nodeId);
    if (params.direction) query.set('direction', params.direction);
    if (params.maxDepth) query.set('maxDepth', params.maxDepth.toString());

    return this.request<any>(`/api/v1/graph/traverse?${query.toString()}`);
  }

  public async getGraphStats() {
    return this.request<{
      tenantId: string;
      totalNodes: number;
      totalEdges: number;
      categoryCounts: Record<string, number>;
      typeCounts: Record<string, number>;
    }>('/api/v1/graph/stats');
  }

  public async getReviewQueue() {
    return this.request<{ items: any[] }>('/api/v1/graph/review-queue');
  }

  public async decideReviewItem(id: string, decision: 'APPROVED' | 'REJECTED', notes?: string) {
    return this.request<any>(`/api/v1/graph/review-queue/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes }),
    });
  }

  public async seedDemoGraph() {
    return this.request<any>('/api/v1/graph/seed-demo', { method: 'POST' });
  }

  // Phase 4: Hybrid Search & Context Engine
  public async searchHybrid(params: { q: string; targetEntityId?: string; topK?: number }) {
    const query = new URLSearchParams();
    query.set('q', params.q);
    if (params.targetEntityId) query.set('targetEntityId', params.targetEntityId);
    if (params.topK) query.set('topK', params.topK.toString());

    return this.request<{
      query: string;
      tenantId: string;
      totalHits: number;
      results: any[];
      executionTimeMs: number;
    }>(`/api/v1/search/hybrid?${query.toString()}`);
  }

  public async getAssembledContext(params: { q: string; targetEntityId?: string }) {
    const query = new URLSearchParams();
    query.set('q', params.q);
    if (params.targetEntityId) query.set('targetEntityId', params.targetEntityId);

    return this.request<any>(`/api/v1/search/context?${query.toString()}`);
  }

  public async ingestDocument(doc: {
    title: string;
    docType: string;
    content: string;
    sourceFile?: string;
    mimeType?: string;
    metadata?: Record<string, unknown>;
    linkedEntityIds?: string[];
  }) {
    return this.request<any>('/api/v1/documents/ingest', {
      method: 'POST',
      body: JSON.stringify(doc),
    });
  }

  public async getDocuments() {
    return this.request<{ tenantId: string; total: number; documents: any[] }>('/api/v1/documents');
  }

  public async getDocumentChunks(documentId: string) {
    return this.request<{ documentId: string; totalChunks: number; chunks: any[] }>(`/api/v1/documents/${documentId}/chunks`);
  }

  public async seedStandardDocs() {
    return this.request<any>('/api/v1/search/seed-docs', { method: 'POST' });
  }

  // Phase 5: Reasoning & RCA
  public async getIncidents() {
    return this.request<{ tenantId: string; total: number; incidents: any[] }>('/api/v1/reasoning/incidents');
  }

  public async runRCA(payload?: { incidentId?: string; customIncident?: any }) {
    return this.request<any>('/api/v1/reasoning/rca', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  public async analyzeCorrelations(telemetry: any[], timeWindowSeconds?: number) {
    return this.request<{ patternsCount: number; patterns: any[] }>('/api/v1/reasoning/correlate', {
      method: 'POST',
      body: JSON.stringify({ telemetry, timeWindowSeconds }),
    });
  }

  // Phase 6: Action & Closed-Loop Execution
  public async getActionProposals() {
    return this.request<{ tenantId: string; total: number; proposals: any[] }>('/api/v1/actions/proposals');
  }

  public async approveActionProposal(id: string) {
    return this.request<any>(`/api/v1/actions/proposals/${id}/approve`, { method: 'POST' });
  }

  public async rejectActionProposal(id: string, reason?: string) {
    return this.request<any>(`/api/v1/actions/proposals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  public async executeActionProposal(id: string, customContext?: any) {
    return this.request<any>(`/api/v1/actions/proposals/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ customContext }),
    });
  }

  public async verifyFeedback(executionId: string, payload: { proposalId: string; currentSensorValue: number; elapsedMinutes: number }) {
    return this.request<any>(`/api/v1/actions/executions/${executionId}/verify-feedback`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async triggerRollback(executionId: string, proposalId: string) {
    return this.request<any>(`/api/v1/actions/executions/${executionId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ proposalId }),
    });
  }

  public async getMachineState(entityId: string) {
    return this.request<{ entityId: string; state: string }>(`/api/v1/actions/machine-state/${entityId}`);
  }

  public async setMachineState(entityId: string, state: string) {
    return this.request<{ entityId: string; state: string }>(`/api/v1/actions/machine-state/${entityId}`, {
      method: 'POST',
      body: JSON.stringify({ state }),
    });
  }

  public async chatWithCopilot(message: string) {
    return this.request<{ reply: string; timestamp: string; tenantId: string }>('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // Health
  public async getHealth() {
    return this.request<any>('/api/v1/health');
  }

  public async getOpenApiSpec() {
    return this.request<any>('/api/v1/openapi.json');
  }
}

export const api = new ApiService();
