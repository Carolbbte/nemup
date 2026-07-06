import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';
import type { SessionConfig } from '../types.js';

export const GENERATION_QUEUE_NAME = 'generation';

export interface GenerationJobData {
  documentId: string;
  sessionId: string;
  userId: string;
  /** gs://bucket/path — file must already be uploaded (e.g. via uploadFileToStorage) before enqueueing. */
  storagePath: string;
  mimeType: string;
  fileName: string;
  config: SessionConfig;
  curso: string;
}

export interface GenerationJobResult {
  sessionId: string;
}

let connection: IORedis | undefined;
let queue: Queue<GenerationJobData, GenerationJobResult> | undefined;

/**
 * Lazily creates and caches the shared ioredis connection. Importing this
 * module never opens a connection — it only happens the first time this (or
 * `getGenerationQueue`) is actually called, which today only happens when a
 * job is enqueued (USE_GENERATION_V2=true) or from the worker process. This
 * is what keeps the legacy v1 (flag off) path from ever touching Redis.
 */
export function getRedisConnection(): IORedis {
  if (!connection) {
    // BullMQ requires maxRetriesPerRequest disabled on the connection it manages.
    connection = new IORedis(config.redis_url, { maxRetriesPerRequest: null });
  }
  return connection;
}

/** Lazily creates and caches the BullMQ Queue instance — same on-demand rule as getRedisConnection. */
export function getGenerationQueue(): Queue<GenerationJobData, GenerationJobResult> {
  if (!queue) {
    queue = new Queue<GenerationJobData, GenerationJobResult>(GENERATION_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

/**
 * Enqueues a generation job. Idempotent by `documentId`: it's used as the
 * BullMQ job ID, so calling this again for a document that already has a
 * waiting/active/delayed job is a no-op — BullMQ won't create a duplicate.
 * (The worker adds a second idempotency check for the case where a prior
 * job already fully completed and was removed from the queue.)
 */
export async function enqueueGenerationJob(data: GenerationJobData) {
  return getGenerationQueue().add(GENERATION_QUEUE_NAME, data, {
    jobId: data.documentId,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });
}
