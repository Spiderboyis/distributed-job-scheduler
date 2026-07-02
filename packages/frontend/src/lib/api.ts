const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) { this.token = token; if (typeof window !== 'undefined') localStorage.setItem('token', token); }
  getToken(): string | null { if (!this.token && typeof window !== 'undefined') this.token = localStorage.getItem('token'); return this.token; }
  clearToken() { this.token = null; if (typeof window !== 'undefined') localStorage.removeItem('token'); }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      let msg = data.error?.message || 'Request failed';
      if (data.error?.details && Array.isArray(data.error.details)) {
        msg += ': ' + data.error.details.map((d: any) => `${d.field} (${d.message})`).join(', ');
      }
      throw new Error(msg);
    }
    return data as T;
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setToken(data.tokens.accessToken);
    if (typeof window !== 'undefined') localStorage.setItem('refreshToken', data.tokens.refreshToken);
    return data;
  }
  async register(email: string, password: string, name: string) {
    const data = await this.request<any>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    this.setToken(data.tokens.accessToken);
    return data;
  }
  async getMe() { return this.request<any>('/auth/me'); }
  async deleteAccount(password: string) { return this.request<any>('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }); }

  // Organizations
  async getOrgs() { return this.request<any>('/orgs'); }
  async createOrg(name: string, slug: string) { return this.request<any>('/orgs', { method: 'POST', body: JSON.stringify({ name, slug }) }); }

  // Projects
  async getProjects(orgId?: string) { return this.request<any>(`/projects${orgId ? `?organizationId=${orgId}` : ''}`); }
  async createProject(name: string, slug: string, organizationId: string) {
    return this.request<any>('/projects', { method: 'POST', body: JSON.stringify({ name, slug, organizationId }) });
  }

  // Queues
  async getQueues(projectId: string) { return this.request<any>(`/projects/${projectId}/queues`); }
  async getQueue(queueId: string) { return this.request<any>(`/queues/${queueId}`); }
  async createQueue(projectId: string, data: any) { return this.request<any>(`/projects/${projectId}/queues`, { method: 'POST', body: JSON.stringify(data) }); }
  async updateQueue(queueId: string, data: any) { return this.request<any>(`/queues/${queueId}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  async pauseQueue(queueId: string) { return this.request<any>(`/queues/${queueId}/pause`, { method: 'POST' }); }
  async resumeQueue(queueId: string) { return this.request<any>(`/queues/${queueId}/resume`, { method: 'POST' }); }
  async getQueueStats(queueId: string) { return this.request<any>(`/queues/${queueId}/stats`); }

  // Jobs
  async getJobs(queueId: string, params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any>(`/queues/${queueId}/jobs${qs}`);
  }
  async getJob(jobId: string) { return this.request<any>(`/jobs/${jobId}`); }
  async createJob(queueId: string, data: any) { return this.request<any>(`/queues/${queueId}/jobs`, { method: 'POST', body: JSON.stringify(data) }); }
  async createBatchJobs(queueId: string, jobs: any[]) { return this.request<any>(`/queues/${queueId}/jobs/batch`, { method: 'POST', body: JSON.stringify({ jobs }) }); }
  async retryJob(jobId: string) { return this.request<any>(`/jobs/${jobId}/retry`, { method: 'POST' }); }

  // Scheduled Jobs
  async getScheduledJobs(queueId: string) { return this.request<any>(`/queues/${queueId}/scheduled`); }
  async createScheduledJob(queueId: string, data: any) { return this.request<any>(`/queues/${queueId}/scheduled`, { method: 'POST', body: JSON.stringify(data) }); }

  // Workers
  async getWorkers() { return this.request<any>('/workers'); }
  async getWorker(workerId: string) { return this.request<any>(`/workers/${workerId}`); }

  // DLQ
  async getDlqEntries(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any>(`/workers/dlq/entries${qs}`);
  }
  async retryDlqEntry(id: string) { return this.request<any>(`/workers/dlq/${id}/retry`, { method: 'POST' }); }

  // Dashboard
  async getDashboardStats() { return this.request<any>('/workers/dashboard/stats'); }

  // Retry Policies
  async getRetryPolicies() { return this.request<any>('/retry-policies'); }

  // SSE
  createEventSource(): EventSource | null {
    if (typeof window === 'undefined') return null;
    return new EventSource(`${API_BASE}/sse/events`);
  }
}

export const api = new ApiClient();
