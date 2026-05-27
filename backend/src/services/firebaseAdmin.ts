/**
 * Firebase Admin SDK initialization and Firestore/Storage setup
 * Bloque 2: Backend Firebase configuration
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// FIRESTORE COLLECTIONS SCHEMA
// ============================================================================

/**
 * Firestore collection structure:
 *
 * /users/{userId}
 *   - displayName: string
 *   - email: string
 *   - createdAt: timestamp
 *   - xp: number
 *   - gems: number
 *   - streakDays: number
 *
 * /users/{userId}/sessions/{sessionId}
 *   - documentId: string (reference to /documents/{documentId})
 *   - subject: string
 *   - topic: string
 *   - difficulty: string
 *   - format: string[]
 *   - wordCount: number
 *   - estimatedDuration: number
 *   - questions: array of question objects
 *   - flashcards: array of flashcard objects
 *   - summary: object
 *   - transcription: string
 *   - xpReward: number
 *   - gemReward: number
 *   - metadata: {
 *       createdAt: timestamp,
 *       processedAt: timestamp,
 *       groundingValidated: boolean,
 *       groundingScore: number
 *     }
 *
 * /documents/{documentId}
 *   - userId: string
 *   - type: string (photo | pdf | gallery | text)
 *   - fileName: string
 *   - mimeType: string
 *   - fileSizeBytes: number
 *   - storagePath: string (gs://bucket/path)
 *   - uploadedAt: timestamp
 *   - transcription: string (populated after OCR)
 *   - metadata: object
 */

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

let db: admin.firestore.Firestore;
let storage: admin.storage.Storage;
let auth: admin.auth.Auth;

export async function initializeFirebase(): Promise<void> {
  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      console.log('[Firebase] Already initialized');
      db = admin.firestore();
      storage = admin.storage();
      auth = admin.auth();
      return;
    }

    // Try to load service account from environment
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set. Provide JSON string of Firebase service account.'
      );
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    // Initialize Firebase Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });

    db = admin.firestore();
    storage = admin.storage();
    auth = admin.auth();

    // Enable offline persistence for Firestore (optional, but useful)
    db.settings({
      ignoreUndefinedProperties: true,
    });

    console.log('[Firebase] ✅ Initialized successfully');
  } catch (error) {
    console.error('[Firebase] ❌ Initialization failed:', error);
    throw error;
  }
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

/**
 * Get Firestore instance (must call initializeFirebase first)
 */
export function getFirestore(): admin.firestore.Firestore {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return db;
}

/**
 * Create or update a user document
 */
export async function createOrUpdateUser(
  userId: string,
  data: {
    displayName?: string;
    email: string;
    photoURL?: string;
  }
): Promise<void> {
  const userRef = db.collection('users').doc(userId);
  const snapshot = await userRef.get();

  if (snapshot.exists) {
    // Update existing user (merge, don't overwrite)
    await userRef.update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // Create new user
    await userRef.set({
      ...data,
      xp: 0,
      gems: 0,
      streakDays: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Save a generated session to Firestore
 */
export async function saveSession(
  userId: string,
  sessionId: string,
  sessionData: any
): Promise<void> {
  const sessionRef = db.collection('users').doc(userId).collection('sessions').doc(sessionId);
  await sessionRef.set({
    ...sessionData,
    metadata: {
      ...sessionData.metadata,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });
}

/**
 * Save an uploaded document metadata to Firestore
 */
export async function saveDocumentMetadata(
  userId: string,
  documentId: string,
  documentData: any
): Promise<void> {
  const docRef = db.collection('documents').doc(documentId);
  await docRef.set({
    userId,
    ...documentData,
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get user's session by ID
 */
export async function getSession(userId: string, sessionId: string): Promise<any | null> {
  const sessionRef = db.collection('users').doc(userId).collection('sessions').doc(sessionId);
  const snapshot = await sessionRef.get();
  return snapshot.exists ? snapshot.data() : null;
}

/**
 * Update user XP and gems after session completion
 */
export async function updateUserRewards(
  userId: string,
  xpGain: number,
  gemGain: number
): Promise<void> {
  const userRef = db.collection('users').doc(userId);
  await userRef.set(
    {
      xp: admin.firestore.FieldValue.increment(xpGain),
      gems: admin.firestore.FieldValue.increment(gemGain),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// ============================================================================
// CLOUD STORAGE OPERATIONS
// ============================================================================

/**
 * Get Cloud Storage bucket instance
 */
export function getStorage(): admin.storage.Storage {
  if (!storage) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return storage;
}

/**
 * Upload file from buffer to Cloud Storage
 * Returns storage path (gs://bucket/path)
 */
export async function uploadFileToStorage(
  userId: string,
  documentId: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const bucket = storage.bucket();
  const storagePath = `documents/${userId}/${documentId}/${fileName}`;
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      customMetadata: {
        userId,
        documentId,
      },
    },
  });

  return `gs://${bucket.name}/${storagePath}`;
}

/**
 * Download file from Cloud Storage
 */
export async function downloadFileFromStorage(storagePath: string): Promise<Buffer> {
  const bucket = storage.bucket();
  // Parse gs:// URI to get file path
  const path = storagePath.replace(/^gs:\/\/[^/]+\//, '');
  const file = bucket.file(path);
  const [buffer] = await file.download();
  return buffer;
}

/**
 * Delete file from Cloud Storage
 */
export async function deleteFileFromStorage(storagePath: string): Promise<void> {
  const bucket = storage.bucket();
  const path = storagePath.replace(/^gs:\/\/[^/]+\//, '');
  const file = bucket.file(path);
  await file.delete();
}

// ============================================================================
// FIREBASE AUTH OPERATIONS
// ============================================================================

/**
 * Get Auth instance
 */
export function getAuth(): admin.auth.Auth {
  if (!auth) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return auth;
}

/**
 * Verify ID token from frontend
 */
export async function verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
  return auth.verifyIdToken(token);
}

/**
 * Create a custom token for testing/development
 */
export async function createCustomToken(userId: string): Promise<string> {
  return auth.createCustomToken(userId);
}
