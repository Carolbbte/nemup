/**
 * Tests for transcriptionService.ts
 *
 * Pure-function tests run without mocks.
 * Integration tests mock pdf-parse and openai to simulate:
 *   1. PDF digital  (pdf-parse returns sufficient words → pdf_text path)
 *   2. PDF escaneado (pdf-parse returns < 100 words → vision_ocr path)
 *   3. PDF con respuestas manuscritas (Vision OCR returns annotations)
 *   4. PDF con diagramas (Vision OCR extracts diagram descriptions)
 *   5. PDF con menos de 50 palabras (Vision OCR also returns sparse content)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted() ensures mock functions exist before vi.mock() factories run
// ---------------------------------------------------------------------------

const { mockPdfParse, mockCreate } = vi.hoisted(() => ({
  mockPdfParse: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('pdf-parse', () => ({ default: mockPdfParse }));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock('../../config.js', () => ({
  config: {
    openai_api_key: 'test-key',
    openai_model: 'gpt-4.1-mini',
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import {
  normalizeText,
  countWords,
  parseStructuredOcr,
  buildConfidence,
  transcribeDocumentFromBuffer,
} from '../transcriptionService.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeOpenAiResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

function makeBuffer(content = 'test') {
  return Buffer.from(content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('normalizeText', () => {
  it('collapses multiple spaces and newlines', () => {
    expect(normalizeText('hello\n\n  world\r\n')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  text  ')).toBe('text');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('countWords', () => {
  it('counts words separated by spaces', () => {
    expect(countWords('uno dos tres')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('ignores extra whitespace', () => {
    expect(countWords('  uno   dos  ')).toBe(2);
  });
});

describe('parseStructuredOcr', () => {
  it('extracts document content', () => {
    const raw = '[DOCUMENT_CONTENT]\nContenido del documento.\n[/DOCUMENT_CONTENT]\n[STUDENT_ANNOTATIONS]\n(ninguna)\n[/STUDENT_ANNOTATIONS]';
    const { documentContent, studentAnnotations } = parseStructuredOcr(raw);
    expect(documentContent).toBe('Contenido del documento.');
    expect(studentAnnotations).toBe('(ninguna)');
  });

  it('extracts student annotations when present', () => {
    const raw = '[DOCUMENT_CONTENT]\nPregunta 1.\n[/DOCUMENT_CONTENT]\n[STUDENT_ANNOTATIONS]\nRespuesta manuscrita: B\n[/STUDENT_ANNOTATIONS]';
    const { studentAnnotations } = parseStructuredOcr(raw);
    expect(studentAnnotations).toBe('Respuesta manuscrita: B');
  });

  it('falls back to full text when section markers are absent', () => {
    const raw = 'Texto sin marcadores de sección.';
    const { documentContent, studentAnnotations } = parseStructuredOcr(raw);
    expect(documentContent).toBe('Texto sin marcadores de sección.');
    expect(studentAnnotations).toBe('');
  });

  it('handles multiline content within sections', () => {
    const raw = '[DOCUMENT_CONTENT]\nLínea 1\nLínea 2\nLínea 3\n[/DOCUMENT_CONTENT]\n[STUDENT_ANNOTATIONS]\n(ninguna)\n[/STUDENT_ANNOTATIONS]';
    const { documentContent } = parseStructuredOcr(raw);
    expect(documentContent).toContain('Línea 1');
    expect(documentContent).toContain('Línea 3');
  });
});

describe('buildConfidence', () => {
  it('returns near-maximum for pdf_text with many words', () => {
    expect(buildConfidence('pdf_text', 600)).toBe(0.97);
  });

  it('scales pdf_text confidence with low word count', () => {
    const c = buildConfidence('pdf_text', 0);
    expect(c).toBeGreaterThanOrEqual(0.70);
    expect(c).toBeLessThan(0.97);
  });

  it('returns 0.82 for vision_ocr with many words', () => {
    expect(buildConfidence('vision_ocr', 300)).toBe(0.82);
  });

  it('scales vision_ocr confidence for sparse content', () => {
    const c = buildConfidence('vision_ocr', 0);
    expect(c).toBeGreaterThanOrEqual(0.50);
    expect(c).toBeLessThan(0.82);
  });

  it('never returns a value below 0.50 for vision_ocr', () => {
    expect(buildConfidence('vision_ocr', 0)).toBeGreaterThanOrEqual(0.50);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — with mocked pdf-parse and openai
// ---------------------------------------------------------------------------

describe('transcribeDocumentFromBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: PDF digital ──────────────────────────────────────────────────
  it('uses pdf_text extraction for a digital PDF with sufficient words', async () => {
    const digitalText = Array(150).fill('palabra').join(' '); // 150 words
    mockPdfParse.mockResolvedValue({ text: digitalText, numpages: 3 });

    const result = await transcribeDocumentFromBuffer(
      makeBuffer(),
      'application/pdf',
      'apunte.pdf',
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.report.extractionMethod).toBe('pdf_text');
    expect(result.report.pageCount).toBe(3);
    expect(result.report.studentAnnotationsDetected).toBe(false);
    expect(result.wordCount).toBe(150);
    expect(result.report.confidence).toBeGreaterThanOrEqual(0.70);
  });

  // ── Test 2: PDF escaneado ────────────────────────────────────────────────
  it('falls back to vision_ocr for a scanned PDF (< 100 words from pdf-parse)', async () => {
    mockPdfParse.mockResolvedValue({ text: 'pocos palabras', numpages: 6 });

    const ocrContent = `[DOCUMENT_CONTENT]
Ondas y sus Parámetros. Unidad 3. Física 2° Medio.
1. ¿Qué es una onda? Una onda es una perturbación que propaga energía.
2. Parámetros: amplitud, frecuencia, longitud de onda, período.
Fórmula: v = λ × f
[/DOCUMENT_CONTENT]
[STUDENT_ANNOTATIONS]
(ninguna)
[/STUDENT_ANNOTATIONS]`;

    mockCreate.mockResolvedValue(makeOpenAiResponse(ocrContent));

    const result = await transcribeDocumentFromBuffer(
      makeBuffer(),
      'application/pdf',
      'guia_fisica.pdf',
    );

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.report.extractionMethod).toBe('vision_ocr');
    expect(result.report.pageCount).toBe(6);
    expect(result.report.studentAnnotationsDetected).toBe(false);
    expect(result.transcription).toContain('v = λ × f');
    expect(result.transcription).not.toContain('[DOCUMENT_CONTENT]');
  });

  // ── Test 3: PDF con respuestas manuscritas ───────────────────────────────
  it('detects student annotations and excludes them from transcription', async () => {
    mockPdfParse.mockResolvedValue({ text: '', numpages: 4 });

    const ocrContent = `[DOCUMENT_CONTENT]
Evaluación de Física. Ondas.
1. ¿Cuál es la relación entre frecuencia y período?
2. Calcula la velocidad de una onda con λ = 2 m y f = 5 Hz.
[/DOCUMENT_CONTENT]
[STUDENT_ANNOTATIONS]
1. T = 1/f (escrito en rojo)
2. v = 10 m/s (escrito en rojo)
[/STUDENT_ANNOTATIONS]`;

    mockCreate.mockResolvedValue(makeOpenAiResponse(ocrContent));

    const result = await transcribeDocumentFromBuffer(
      makeBuffer(),
      'application/pdf',
      'evaluacion.pdf',
    );

    expect(result.report.studentAnnotationsDetected).toBe(true);
    // Transcription should contain questions but NOT the handwritten answers
    expect(result.transcription).toContain('frecuencia y período');
    expect(result.transcription).not.toContain('escrito en rojo');
    expect(result.transcription).not.toContain('T = 1/f');
  });

  // ── Test 4: PDF con diagramas ────────────────────────────────────────────
  it('includes diagram descriptions in document content', async () => {
    mockPdfParse.mockResolvedValue({ text: 'fig', numpages: 2 });

    const ocrContent = `[DOCUMENT_CONTENT]
Ondas transversales y longitudinales.
[Diagrama: onda transversal con crestas y valles marcados, flecha indicando dirección de propagación]
[Diagrama: onda longitudinal con zonas de compresión y rarefacción]
La longitud de onda λ es la distancia entre dos crestas consecutivas.
[/DOCUMENT_CONTENT]
[STUDENT_ANNOTATIONS]
(ninguna)
[/STUDENT_ANNOTATIONS]`;

    mockCreate.mockResolvedValue(makeOpenAiResponse(ocrContent));

    const result = await transcribeDocumentFromBuffer(
      makeBuffer(),
      'application/pdf',
      'diagrama_ondas.pdf',
    );

    expect(result.report.extractionMethod).toBe('vision_ocr');
    expect(result.transcription).toContain('Diagrama');
    expect(result.transcription).toContain('longitud de onda');
    expect(result.wordCount).toBeGreaterThan(10);
  });

  // ── Test 5: PDF con menos de 50 palabras (incluso tras OCR) ─────────────
  it('returns low wordCount when vision OCR also yields sparse content', async () => {
    mockPdfParse.mockResolvedValue({ text: '', numpages: 1 });

    // The OCR itself can only extract a few words (e.g. very degraded scan)
    const ocrContent = `[DOCUMENT_CONTENT]
Pregunta 1.
[/DOCUMENT_CONTENT]
[STUDENT_ANNOTATIONS]
(ninguna)
[/STUDENT_ANNOTATIONS]`;

    mockCreate.mockResolvedValue(makeOpenAiResponse(ocrContent));

    const result = await transcribeDocumentFromBuffer(
      makeBuffer(),
      'application/pdf',
      'borroso.pdf',
    );

    expect(result.report.extractionMethod).toBe('vision_ocr');
    // wordCount is below the 50-word session threshold — sessions.ts will
    // reject this with INSUFFICIENT_CONTENT, which is the correct behavior
    expect(result.wordCount).toBeLessThan(50);
  });

  // ── Image processing ─────────────────────────────────────────────────────
  it('uses vision_ocr for image files', async () => {
    const ocrContent = `[DOCUMENT_CONTENT]
Fotografía de apunte: Ley de Ohm V = I × R
[/DOCUMENT_CONTENT]
[STUDENT_ANNOTATIONS]
(ninguna)
[/STUDENT_ANNOTATIONS]`;

    mockCreate.mockResolvedValue(makeOpenAiResponse(ocrContent));

    const result = await transcribeDocumentFromBuffer(
      makeBuffer(),
      'image/jpeg',
      'apunte.jpg',
    );

    expect(result.report.extractionMethod).toBe('vision_ocr');
    expect(result.report.pageCount).toBe(1);
    expect(result.transcription).toContain('V = I × R');
  });

  // ── Unsupported format ───────────────────────────────────────────────────
  it('throws for unsupported file formats', async () => {
    await expect(
      transcribeDocumentFromBuffer(makeBuffer(), 'application/zip', 'archivo.zip'),
    ).rejects.toThrow('Formato de documento no soportado');
  });
});
