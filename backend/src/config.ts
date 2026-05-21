/**
 * Environment configuration loader
 * Safely load and validate Firebase credentials and API keys
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env file
dotenv.config({ path: resolve(process.cwd(), '.env') });

export interface Config {
  node_env: string;
  port: number;
  openai_api_key: string;
  openai_model: string;
  firebase_service_account_json: string;
  firebase_storage_bucket: string;
}

export function loadConfig(): Config {
  const config: Config = {
    node_env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    openai_api_key: process.env.OPENAI_API_KEY ?? process.env.CLAUDE_API_KEY ?? '',
    openai_model: process.env.OPENAI_MODEL ?? process.env.CLAUDE_MODEL ?? 'gpt-4.1-mini',
    firebase_service_account_json: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '',
    firebase_storage_bucket: process.env.FIREBASE_STORAGE_BUCKET ?? '',
  };

  // Validation
  const errors: string[] = [];

  if (!config.openai_api_key) {
    errors.push('Missing OPENAI_API_KEY in .env');
  }

  if (!config.firebase_service_account_json) {
    errors.push('Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env');
  }

  if (!config.firebase_storage_bucket) {
    errors.push('Missing FIREBASE_STORAGE_BUCKET in .env');
  }

  if (errors.length > 0) {
    console.error('[Config] ❌ Environment validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('[Config] ✅ All required variables set');
  return config;
}

export const config = loadConfig();
