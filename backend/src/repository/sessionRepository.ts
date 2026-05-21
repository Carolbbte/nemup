/**
 * Session repository layer. Encapsulates Firebase persistence operations.
 */

import type { GeneratedSession } from '../types.js';
import {
  saveSession as persistSession,
  saveDocumentMetadata as persistDocument,
  updateUserRewards as updateRewards,
  getSession as fetchSession,
} from '../services/firebaseAdmin.js';

export async function saveDocumentMetadata(
  userId: string,
  documentId: string,
  documentData: Record<string, unknown>
): Promise<void> {
  await persistDocument(userId, documentId, documentData);
}

export async function saveGeneratedSession(
  userId: string,
  sessionId: string,
  sessionData: GeneratedSession
): Promise<void> {
  await persistSession(userId, sessionId, sessionData);
}

export async function getGeneratedSession(
  userId: string,
  sessionId: string
): Promise<GeneratedSession | null> {
  return (await fetchSession(userId, sessionId)) as GeneratedSession | null;
}

export async function applyUserRewards(
  userId: string,
  xpGain: number,
  gemGain: number
): Promise<void> {
  await updateRewards(userId, xpGain, gemGain);
}
