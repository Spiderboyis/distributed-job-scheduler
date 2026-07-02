/**
 * Simulated Job Executor
 *
 * Executes simulated workloads that mimic real-world job scenarios.
 * Covers best and worst cases:
 *   - Best case:  email_send — fast, low failure rate
 *   - Normal case: image_resize — moderate duration, occasional failures
 *   - Worst case:  report_generate — long-running, high failure rate, timeouts
 *   - Edge case:   webhook_call — network errors, timeouts
 */

interface JobConfig {
  minDurationMs: number;
  maxDurationMs: number;
  failureRate: number;       // 0 to 1
  timeoutChance: number;     // chance of exceeding timeout
  possibleErrors: string[];
}

const JOB_CONFIGS: Record<string, JobConfig> = {
  // BEST CASE: Quick, reliable
  email_send: {
    minDurationMs: 100,
    maxDurationMs: 2000,
    failureRate: 0.05,       // 5% failure
    timeoutChance: 0.01,
    possibleErrors: [
      'SMTP connection refused',
      'Invalid recipient address',
      'Rate limit exceeded by email provider',
    ],
  },
  // NORMAL CASE: Moderate, some failures
  image_resize: {
    minDurationMs: 500,
    maxDurationMs: 8000,
    failureRate: 0.15,       // 15% failure
    timeoutChance: 0.05,
    possibleErrors: [
      'Unsupported image format',
      'Image file corrupted',
      'Out of memory during processing',
      'Source image not found (404)',
    ],
  },
  // EXPORT: Variable duration, moderate failure
  data_export: {
    minDurationMs: 1000,
    maxDurationMs: 15000,
    failureRate: 0.10,
    timeoutChance: 0.08,
    possibleErrors: [
      'Database query timeout',
      'Insufficient disk space',
      'CSV encoding error',
      'Permission denied on storage bucket',
    ],
  },
  // WORST CASE: Long, high failure rate
  report_generate: {
    minDurationMs: 3000,
    maxDurationMs: 25000,
    failureRate: 0.30,       // 30% failure
    timeoutChance: 0.15,
    possibleErrors: [
      'Aggregation query failed: division by zero',
      'Template rendering error: undefined variable',
      'PDF generation timeout',
      'Data source unavailable',
      'Memory heap overflow during chart rendering',
    ],
  },
  // EDGE CASE: Network issues
  webhook_call: {
    minDurationMs: 200,
    maxDurationMs: 10000,
    failureRate: 0.20,
    timeoutChance: 0.12,
    possibleErrors: [
      'Connection timed out after 10000ms',
      'DNS resolution failed',
      'TLS handshake error',
      'HTTP 502 Bad Gateway',
      'HTTP 503 Service Unavailable',
      'Connection reset by peer',
    ],
  },
};

// Default config for unknown job types
const DEFAULT_CONFIG: JobConfig = {
  minDurationMs: 200,
  maxDurationMs: 5000,
  failureRate: 0.10,
  timeoutChance: 0.05,
  possibleErrors: ['Unknown processing error', 'Internal server error'],
};

/**
 * Execute a simulated job workload.
 * Returns a result object on success, throws on failure.
 */
export async function executeSimulatedJob(job: any): Promise<Record<string, any>> {
  const jobType = job.payload?.type || job.name || 'unknown';
  const config = JOB_CONFIGS[jobType] || DEFAULT_CONFIG;

  // Calculate duration
  const duration = config.minDurationMs + Math.random() * (config.maxDurationMs - config.minDurationMs);

  // Check if job should timeout
  if (Math.random() < config.timeoutChance && job.timeout_ms) {
    const timeoutDuration = job.timeout_ms + 1000;
    await sleep(Math.min(timeoutDuration, 5000)); // Cap simulated timeout
    throw new Error(`Job timed out after ${job.timeout_ms}ms`);
  }

  // Simulate work
  await sleep(Math.min(duration, 5000)); // Cap simulation for demo

  // Check if job should fail
  if (Math.random() < config.failureRate) {
    const errorIdx = Math.floor(Math.random() * config.possibleErrors.length);
    throw new Error(config.possibleErrors[errorIdx]);
  }

  // Success — return simulated result
  return {
    jobType,
    processedAt: new Date().toISOString(),
    durationMs: Math.round(duration),
    metadata: generateResultMetadata(jobType, job.payload),
  };
}

function generateResultMetadata(jobType: string, payload: any): Record<string, any> {
  switch (jobType) {
    case 'email_send':
      return { delivered: true, messageId: `msg_${Date.now()}`, recipient: payload?.to || 'user@example.com' };
    case 'image_resize':
      return { outputSize: `${payload?.width || 800}x${payload?.height || 600}`, format: 'webp', compressionRatio: 0.72 };
    case 'data_export':
      return { rowsExported: Math.floor(Math.random() * 50000), fileSize: `${(Math.random() * 100).toFixed(1)}MB`, format: payload?.format || 'csv' };
    case 'report_generate':
      return { pages: Math.floor(Math.random() * 20) + 1, charts: Math.floor(Math.random() * 8), format: 'pdf' };
    case 'webhook_call':
      return { statusCode: 200, responseTime: Math.floor(Math.random() * 500), endpoint: payload?.url || 'https://api.example.com/webhook' };
    default:
      return { processed: true };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
