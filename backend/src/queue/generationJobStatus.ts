/**
 * Shared Firestore-backed status record for a generation job — the single
 * source of truth both the producer (routes/sessions.ts, on enqueue) and the
 * consumer (workers/generationWorker.ts, while processing) read/write, so
 * the collection name and shape can't drift between the two.
 */

import admin from 'firebase-admin';
import { getFirestore } from '../services/firebaseAdmin.js';

export type GenerationJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface GenerationJobRecord {
  status: GenerationJobStatus;
  userId: string;
  sessionId: string;
  fileName?: string;
  error?: string;
}

function jobsCollection() {
  return getFirestore().collection('generationJobs');
}

export async function setGenerationJobStatus(
  documentId: string,
  status: GenerationJobStatus,
  extra: Partial<GenerationJobRecord> = {},
): Promise<void> {
  await jobsCollection()
    .doc(documentId)
    .set({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp(), ...extra }, { merge: true });
}

export async function getGenerationJobStatus(
  documentId: string,
): Promise<GenerationJobRecord | null> {
  const snap = await jobsCollection().doc(documentId).get();
  return snap.exists ? (snap.data() as GenerationJobRecord) : null;
}
