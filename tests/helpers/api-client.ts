/**
 * API Client Helper for System Tests
 * Simulates frontend API calls to the backend
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface SyncRequest {
  idempotencyKey: string;
  entityType: 'pin' | 'form';
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  timestamp?: string;
  deviceId?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  idempotencyKey?: string;
  timestamp?: string;
  error?: string;
}

export class ApiClient {
  private client: AxiosInstance;
  private deviceId: string;

  constructor(baseURL: string = 'http://localhost:3000/api', deviceId?: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.deviceId = deviceId || `device-${uuidv4()}`;
  }

  /**
   * Simulate pushing a sync item from offline queue
   */
  async syncItem(request: Partial<SyncRequest>): Promise<ApiResponse> {
    const fullRequest: SyncRequest = {
      idempotencyKey: request.idempotencyKey || this.generateIdempotencyKey(),
      entityType: request.entityType!,
      operation: request.operation!,
      payload: request.payload,
      timestamp: request.timestamp || new Date().toISOString(),
      deviceId: request.deviceId || this.deviceId,
    };

    try {
      const response = await this.client.post('/sync/item', fullRequest);
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError);
    }
  }

  /**
   * Pull all pins from backend
   */
  async getPins(): Promise<ApiResponse> {
    try {
      const response = await this.client.get('/pins');
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError);
    }
  }

  /**
   * Pull all forms from backend
   */
  async getForms(): Promise<ApiResponse> {
    try {
      const response = await this.client.get('/forms');
      return response.data;
    } catch (error) {
      return this.handleError(error as AxiosError);
    }
  }

  /**
   * Simulate retrying a failed sync operation
   */
  async retrySync(request: SyncRequest, maxRetries: number = 3): Promise<ApiResponse> {
    let lastError: Error | ApiResponse | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Retry attempt ${attempt}/${maxRetries} for ${request.idempotencyKey}`);
        const response = await this.syncItem(request);

        if (response.success) {
          console.log(`Retry succeeded on attempt ${attempt}`);
          return response;
        }

        lastError = response;
        await this.exponentialBackoff(attempt);
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          await this.exponentialBackoff(attempt);
        }
      }
    }

    const errorMessage =
      lastError instanceof Error
        ? lastError.message
        : (lastError as ApiResponse)?.error || 'Unknown error';

    return {
      success: false,
      error: `Failed after ${maxRetries} retries: ${errorMessage}`,
    };
  }

  /**
   * Simulate batch sync operations (like draining offline queue)
   */
  async batchSync(requests: SyncRequest[]): Promise<ApiResponse[]> {
    const results: ApiResponse[] = [];

    for (const request of requests) {
      const result = await this.syncItem(request);
      results.push(result);

      // Small delay between requests to simulate realistic behavior
      await this.delay(100);
    }

    return results;
  }

  /**
   * Simulate concurrent sync operations from multiple devices
   */
  async concurrentSync(requests: SyncRequest[]): Promise<ApiResponse[]> {
    const promises = requests.map((request) => this.syncItem(request));
    return Promise.all(promises);
  }

  /**
   * Generate idempotency key (simulating frontend logic)
   */
  generateIdempotencyKey(): string {
    return `${this.deviceId}-${Date.now()}-${uuidv4()}`;
  }

  /**
   * Simulate network delay
   */
  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Exponential backoff for retries
   */
  private async exponentialBackoff(attempt: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
    console.log(`Backing off for ${delay}ms`);
    await this.delay(delay);
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): ApiResponse {
    if (error.response) {
      const data = error.response.data as Record<string, unknown>;
      return {
        success: false,
        error: (data?.message as string) || error.message,
        ...(typeof data === 'object' ? data : {}),
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'No response from server - network error',
      };
    } else {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Set custom headers (e.g., for authentication)
   */
  setHeaders(headers: Record<string, string>): void {
    Object.assign(this.client.defaults.headers, headers);
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }
}
