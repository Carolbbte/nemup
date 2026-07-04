/**
 * Transcription service for documents and images.
 *
 * Detection strategy:
 *   1. PDFs → try pdf-parse (digital text extraction)
 *   2. If extracted text < 100 words OR < 20 words/page → scanned PDF → Vision OCR
 *   3. Images → Vision OCR directly
 *
 * Vision OCR returns structured output:
 *   [DOCUMENT_CONTENT] … [/DOCUMENT_CONTENT]
 *   [STUDENT_ANNOTATIONS] … [/STUDENT_ANNOTATIONS]
 *
 * Only DOCUMENT_CONTENT is returned in `transcription` for session generation.
 */

import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import { config } from '../config.js';
import { withOpenAIRetry } from './openaiRetry.js';

const openai = new OpenAI({ apiKey: config.openai_api_key });

const SCANNED_WORD_THRESHOLD = 100;
const SCANNED_WORDS_PER_PAGE_THRESHOLD = 20;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const STRUCTURED_OCR_PROMPT = `Eres un OCR pedagógico especializado en material educativo chileno de enseñanza media.
Extrae TODO el contenido visible del documento con la siguiente estructura EXACTA:

[DOCUMENT_CONTENT]
Incluye: texto principal, encabezados, títulos, instrucciones, preguntas numeradas, ejercicios, enunciados, fórmulas, tablas, listas y descripciones de diagramas o figuras.
[/DOCUMENT_CONTENT]

[STUDENT_ANNOTATIONS]
Incluye: respuestas manuscritas, correcciones, notas o subrayados escritos a mano por el estudiante.
Si no hay anotaciones del estudiante, escribe exactamente: (ninguna)
[/STUDENT_ANNOTATIONS]

REGLAS OBLIGATORIAS:
- DOCUMENT_CONTENT contiene únicamente texto impreso o tipeado del documento original
- STUDENT_ANNOTATIONS contiene únicamente texto que parece escrito a mano por un estudiante
- Conserva la numeración de preguntas y la estructura de secciones tal como aparece
- Fórmulas en texto legible: "F = m × a", "λ = v / f", "T = 1 / f", "E = mc²"
- Diagramas: escribe "[Diagrama: descripción breve de lo que representa]"
- No incluyas explicaciones propias — solo extrae el contenido tal como aparece`;

const IMAGE_OCR_PROMPT = `Extrae todo el texto visible de esta imagen de manera estructurada.

[DOCUMENT_CONTENT]
Todo el texto impreso, fórmulas, tablas, preguntas y contenido del documento.
[/DOCUMENT_CONTENT]

[STUDENT_ANNOTATIONS]
Texto manuscrito del estudiante, si existe. Si no hay: (ninguna)
[/STUDENT_ANNOTATIONS]

Sin explicaciones adicionales — solo el contenido extraído.`;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExtractionReport {
  extractionMethod: 'pdf_text' | 'vision_ocr';
  pageCount: number;
  extractedWords: number;
  studentAnnotationsDetected: boolean;
  confidence: number;
}

export interface TranscriptionResult {
  /** Only the document's base content — student annotations excluded */
  transcription: string;
  wordCount: number;
  report: ExtractionReport;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Preserves newlines and structural whitespace (headers, numbered lists, blank lines).
// Used when the transcription is stored for pedagogical analysis — NOT for prompt embedding.
export function normalizeTextPreserveStructure(text: string): string {
  return text
    .replace(/\r\n/g, '\n')         // normalize Windows line endings
    .replace(/\r/g, '\n')           // normalize legacy Mac line endings
    .replace(/\t/g, ' ')            // tabs → space
    .replace(/[ \t]+/g, ' ')        // collapse horizontal whitespace, preserve \n
    .replace(/[ \t]*\n[ \t]*/g, '\n') // trim spaces flanking line breaks
    .replace(/\n{3,}/g, '\n\n')     // max 2 consecutive blank lines
    .trim();
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Splits Vision OCR output into document content and student annotations.
 * Falls back to treating the whole string as document content when the
 * expected section markers are absent (e.g. image with no sections).
 */
export function parseStructuredOcr(raw: string): {
  documentContent: string;
  studentAnnotations: string;
} {
  const docMatch = raw.match(/\[DOCUMENT_CONTENT\]([\s\S]*?)\[\/DOCUMENT_CONTENT\]/);
  const annMatch = raw.match(/\[STUDENT_ANNOTATIONS\]([\s\S]*?)\[\/STUDENT_ANNOTATIONS\]/);

  const documentContent = docMatch ? docMatch[1].trim() : raw.trim();
  const studentAnnotations = annMatch ? annMatch[1].trim() : '';

  return { documentContent, studentAnnotations };
}

/**
 * Returns a 0–1 confidence estimate for the extraction result.
 * pdf_text is near-perfect; Vision OCR is probabilistic.
 */
export function buildConfidence(
  method: 'pdf_text' | 'vision_ocr',
  words: number,
): number {
  if (method === 'pdf_text') {
    if (words >= 500) return 0.97;
    return Math.max(0.70, 0.70 + (words / 500) * 0.27);
  }
  // vision_ocr
  if (words >= 200) return 0.82;
  return Math.max(0.50, 0.50 + (words / 200) * 0.32);
}

// ---------------------------------------------------------------------------
// Vision OCR helpers
// ---------------------------------------------------------------------------

type VisionContentPart =
  | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
  | { type: 'file'; file: { filename: string; file_data: string } };

async function callVisionOcr(
  contentPart: VisionContentPart,
  prompt: string,
): Promise<string> {
  const response = await withOpenAIRetry(() => openai.chat.completions.create({
    model: config.openai_model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          contentPart as OpenAI.ChatCompletionContentPart,
        ],
      },
    ],
    max_tokens: 4000,
  }), 'VisionOCR');
  return response.choices?.[0]?.message?.content ?? '';
}

async function processScannedPdf(
  buffer: Buffer,
  fileName: string,
  pageCount: number,
): Promise<TranscriptionResult> {
  console.log(`[Transcription] Scanned PDF — sending to Vision OCR (${pageCount} pages)`);
  const base64 = buffer.toString('base64');

  const raw = await callVisionOcr(
    {
      type: 'file',
      file: {
        filename: fileName,
        file_data: `data:application/pdf;base64,${base64}`,
      },
    },
    STRUCTURED_OCR_PROMPT,
  );

  return buildVisionResult(raw, pageCount);
}

async function processImage(
  buffer: Buffer,
  mimeType: string,
): Promise<TranscriptionResult> {
  const base64 = buffer.toString('base64');

  const raw = await callVisionOcr(
    {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' },
    },
    IMAGE_OCR_PROMPT,
  );

  return buildVisionResult(raw, 1);
}

function buildVisionResult(raw: string, pageCount: number): TranscriptionResult {
  const { documentContent, studentAnnotations } = parseStructuredOcr(raw);
  const transcription = normalizeTextPreserveStructure(documentContent);
  const words = countWords(transcription);
  const studentAnnotationsDetected =
    studentAnnotations.length > 0 && studentAnnotations !== '(ninguna)';

  return {
    transcription,
    wordCount: words,
    report: {
      extractionMethod: 'vision_ocr',
      pageCount,
      extractedWords: words,
      studentAnnotationsDetected,
      confidence: buildConfidence('vision_ocr', words),
    },
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function transcribeDocumentFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<TranscriptionResult> {
  // ── PDF ──────────────────────────────────────────────────────────────────
  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    const pdfData = await pdfParse(buffer);
    const pageCount: number = pdfData.numpages ?? 1;
    const digitalText = normalizeTextPreserveStructure(pdfData.text || '');
    const digitalWords = countWords(digitalText);
    const wordsPerPage = pageCount > 0 ? digitalWords / pageCount : digitalWords;

    const isScanned =
      digitalWords < SCANNED_WORD_THRESHOLD ||
      wordsPerPage < SCANNED_WORDS_PER_PAGE_THRESHOLD;

    if (!isScanned) {
      console.log(
        `[Transcription] Digital PDF — ${digitalWords} words / ${pageCount} pages`,
      );
      return {
        transcription: digitalText,
        wordCount: digitalWords,
        report: {
          extractionMethod: 'pdf_text',
          pageCount,
          extractedWords: digitalWords,
          studentAnnotationsDetected: false,
          confidence: buildConfidence('pdf_text', digitalWords),
        },
      };
    }

    return processScannedPdf(buffer, fileName, pageCount);
  }

  // ── Plain text ───────────────────────────────────────────────────────────
  if (mimeType.startsWith('text/') || fileName.toLowerCase().endsWith('.txt')) {
    const text = normalizeTextPreserveStructure(buffer.toString('utf-8'));
    const words = countWords(text);
    return {
      transcription: text,
      wordCount: words,
      report: {
        extractionMethod: 'pdf_text',
        pageCount: 1,
        extractedWords: words,
        studentAnnotationsDetected: false,
        confidence: 0.99,
      },
    };
  }

  // ── Image ────────────────────────────────────────────────────────────────
  if (
    mimeType.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.heic', '.webp'].some((ext) =>
      fileName.toLowerCase().endsWith(ext),
    )
  ) {
    return processImage(buffer, mimeType);
  }

  throw new Error('Formato de documento no soportado para transcripción.');
}
