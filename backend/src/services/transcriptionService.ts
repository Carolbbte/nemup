/**
 * Transcription service for documents and images.
 * Uses OpenAI for image OCR and pdf-parse for PDF extraction.
 */

import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { getStorage } from './firebaseAdmin.js';
import { config } from '../config.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

function normalizeText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return normalizeText(data.text || '');
}

function getStorageFilePath(gsUri: string): string {
  return gsUri.replace(/^gs:\/\/[^/]+\//, '');
}

async function createSignedReadUrl(gsUri: string): Promise<string> {
  const bucket = getStorage().bucket();
  const filePath = getStorageFilePath(gsUri);
  const file = bucket.file(filePath);
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000,
  });
  return signedUrl;
}

async function extractTextFromImage(gsUri: string): Promise<string> {
  const signedUrl = await createSignedReadUrl(gsUri);
  const prompt = `Extrae todo el texto legible de esta imagen. Responde solo con el texto extraído, sin explicaciones, sin numeración adicional y sin formato extra.`;

  const response = await openai.responses.create({
    model: config.openai_model,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: signedUrl, detail: 'auto' },
        ],
      },
    ],
  });

  if (!response.output || response.output.length === 0) {
    throw new Error('OpenAI no devolvió texto de la imagen.');
  }

  const textResult = response.output
    .map((chunk: any) => {
      if (typeof chunk === 'string') return chunk;
      if (chunk?.content) {
        return chunk.content
          .map((piece: any) => {
            if (typeof piece === 'string') return piece;
            return piece?.text ?? '';
          })
          .join('');
      }
      return '';
    })
    .join('');

  return normalizeText(textResult || '');
}

export interface TranscriptionResult {
  transcription: string;
  wordCount: number;
}

export async function transcribeDocument(
  storagePath: string,
  mimeType: string,
  fileName: string
): Promise<TranscriptionResult> {
  const bucket = getStorage().bucket();
  const file = bucket.file(getStorageFilePath(storagePath));
  const [buffer] = await file.download();

  let transcription = '';

  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    transcription = await extractTextFromPDF(buffer);
  } else if (mimeType.startsWith('text/') || fileName.toLowerCase().endsWith('.txt')) {
    transcription = normalizeText(buffer.toString('utf-8'));
  } else if (mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.heic', '.webp'].some((ext) => fileName.toLowerCase().endsWith(ext))) {
    transcription = await extractTextFromImage(storagePath);
  } else {
    throw new Error('Formato de documento no soportado para transcripción.');
  }

  const words = transcription.split(/\s+/).filter(Boolean);
  return {
    transcription,
    wordCount: words.length,
  };
}
