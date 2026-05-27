/**
 * Transcription service for documents and images.
 * Uses OpenAI for image OCR and pdf-parse for PDF extraction.
 */

import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
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

async function extractTextFromImageBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const prompt = `Extrae todo el texto legible de esta imagen. Responde solo con el texto extraído, sin explicaciones, sin numeración adicional y sin formato extra.`;

  const response = await openai.chat.completions.create({
    model: config.openai_model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
        ],
      },
    ],
    max_tokens: 2000,
  });

  return normalizeText(response.choices?.[0]?.message?.content ?? '');
}

export interface TranscriptionResult {
  transcription: string;
  wordCount: number;
}

export async function transcribeDocumentFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<TranscriptionResult> {
  let transcription = '';

  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    transcription = await extractTextFromPDF(buffer);
  } else if (mimeType.startsWith('text/') || fileName.toLowerCase().endsWith('.txt')) {
    transcription = normalizeText(buffer.toString('utf-8'));
  } else if (
    mimeType.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.heic', '.webp'].some((ext) => fileName.toLowerCase().endsWith(ext))
  ) {
    transcription = await extractTextFromImageBuffer(buffer, mimeType);
  } else {
    throw new Error('Formato de documento no soportado para transcripción.');
  }

  const words = transcription.split(/\s+/).filter(Boolean);
  return { transcription, wordCount: words.length };
}
