/**
 * Industrial Brain — Generic REST Industrial Connector
 * Phase 2: Real Data Connectors
 *
 * Supports SSRF protection, configurable pagination, rate limiting with exponential backoff,
 * and JSONPath/nested object extraction.
 */

import crypto from 'crypto';
import { SchemaDetector } from './schemaDetector.ts';
import { SchemaDetectionResult } from './types.ts';

export interface RestConnectorConfig {
  endpointUrl: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  authType?: 'NONE' | 'BEARER' | 'API_KEY' | 'BASIC';
  authKey?: string;
  authValue?: string;
  paginationType?: 'NONE' | 'OFFSET_LIMIT' | 'PAGE_NUMBER' | 'CURSOR';
  pageSize?: number;
  maxPages?: number;
  recordsJsonPath?: string; // e.g. 'data.items' or 'results'
}

export class RestEngine {
  /**
   * Enforces SSRF protection by blocking internal IP ranges unless explicitly allowed
   */
  public static validateEndpointUrl(urlString: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      throw new Error(`Malformed REST endpoint URL: '${urlString}'`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Forbidden protocol: '${parsed.protocol}'. Only HTTP/HTTPS allowed.`);
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // SSRF Blocklist (cloud metadata, internal VPC loops, private addresses)
    const blockedHosts = [
      '169.254.169.254', // AWS/GCP Instance Metadata
      'metadata.google.internal',
      'instance-data',
    ];

    if (blockedHosts.includes(host)) {
      throw new Error(`SSRF Blocked: Access to cloud metadata service is strictly forbidden.`);
    }

    // Block loopback, link-local, private RFC 1918, and IPv6 local ranges.
    const isPrivateIp =
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:');

    if (isPrivateIp || host === 'localhost') {
      throw new Error(`SSRF Blocked: Connection to private internal IP addresses is forbidden.`);
    }

    return parsed;
  }

  /**
   * Extracts target array of records using simple dot-notation path
   */
  public static extractRecords(payload: unknown, jsonPath?: string): Record<string, unknown>[] {
    if (!payload) return [];

    let current: any = payload;

    if (jsonPath && jsonPath.trim().length > 0) {
      const parts = jsonPath.split('.');
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          throw new Error(`JSONPath '${jsonPath}' failed at segment '${part}'`);
        }
      }
    }

    if (!Array.isArray(current)) {
      if (typeof current === 'object' && current !== null) {
        return [current];
      }
      throw new Error(`Extracted data at '${jsonPath || 'root'}' is not an array of records.`);
    }

    return current.filter((item) => typeof item === 'object' && item !== null);
  }

  /**
   * Executes REST synchronization with retry & exponential backoff
   */
  public static async fetchRecords(
    config: RestConnectorConfig,
    options: { maxRetries?: number; timeoutMs?: number } = {}
  ): Promise<{
    rows: Record<string, unknown>[];
    schema: SchemaDetectionResult;
    rawChecksum: string;
    totalPagesFetched: number;
  }> {
    const url = this.validateEndpointUrl(config.endpointUrl);
    const maxRetries = options.maxRetries ?? 3;
    const timeoutMs = options.timeoutMs ?? 10000;

    // Build headers
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(config.headers || {}),
    };

    if (config.authType === 'BEARER' && config.authValue) {
      headers['Authorization'] = `Bearer ${config.authValue}`;
    } else if (config.authType === 'API_KEY' && config.authKey && config.authValue) {
      headers[config.authKey] = config.authValue;
    } else if (config.authType === 'BASIC' && config.authValue) {
      headers['Authorization'] = `Basic ${Buffer.from(config.authValue).toString('base64')}`;
    }

    let allRecords: Record<string, unknown>[] = [];
    let pageCount = 0;
    const maxPages = config.maxPages || 1;

    for (let page = 1; page <= maxPages; page++) {
      pageCount++;
      const targetUrl = new URL(url.toString());

      if (config.paginationType === 'PAGE_NUMBER') {
        targetUrl.searchParams.set('page', String(page));
        if (config.pageSize) targetUrl.searchParams.set('limit', String(config.pageSize));
      } else if (config.paginationType === 'OFFSET_LIMIT') {
        const offset = (page - 1) * (config.pageSize || 50);
        targetUrl.searchParams.set('offset', String(offset));
        targetUrl.searchParams.set('limit', String(config.pageSize || 50));
      }

      // Execute with exponential backoff retry
      let responseData: any = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetch(targetUrl.toString(), {
            method: config.method || 'GET',
            headers,
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
            // Rate limit or transient error -> backoff
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          responseData = await res.json();
          break;
        } catch (err) {
          lastError = err as Error;
          if (attempt === maxRetries) {
            throw new Error(`REST request failed after ${maxRetries + 1} attempts: ${lastError.message}`);
          }
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }

      const extracted = this.extractRecords(responseData, config.recordsJsonPath);
      allRecords = allRecords.concat(extracted);

      if (extracted.length === 0 || (config.pageSize && extracted.length < config.pageSize)) {
        break;
      }
    }

    const rawChecksum = crypto.createHash('sha256').update(JSON.stringify(allRecords)).digest('hex');
    const schema = SchemaDetector.analyzeRows(allRecords);

    return {
      rows: allRecords,
      schema,
      rawChecksum,
      totalPagesFetched: pageCount,
    };
  }
}
