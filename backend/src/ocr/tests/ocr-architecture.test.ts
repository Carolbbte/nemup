/**
 * Phase 1 smoke test — confirms the OCR Engine scaffold compiles, wires its
 * default collaborators without executing any logic, and that every public
 * method is an explicit "Not implemented" stub rather than silently doing
 * something. This is NOT a test of OCR behavior — there isn't any yet.
 */

import { describe, it, expect } from 'vitest';
import {
  OCRService,
  OCRFactory,
  DocumentSourceType,
  DocumentType,
  OCRProvider,
  type OCRRequest,
} from '../index.js';

function sampleRequest(): OCRRequest {
  return {
    buffer: Buffer.from(''),
    fileName: 'sample.pdf',
    mimeType: 'application/pdf',
    sourceType: DocumentSourceType.DIGITAL,
    requestedProvider: null,
  };
}

describe('OCR Engine — Phase 1 architecture scaffold', () => {
  it('instantiates OCRService with its default collaborators without executing any logic', () => {
    expect(() => new OCRService()).not.toThrow();
  });

  it('OCRService.process has no implementation yet', async () => {
    const service = new OCRService();
    await expect(service.process(sampleRequest())).rejects.toThrow('Not implemented');
  });

  it('OCRFactory.createExtractor has no implementation yet', () => {
    const factory = new OCRFactory();
    expect(() => factory.createExtractor(sampleRequest())).toThrow('Not implemented');
  });

  it('exposes categorical values as real enums, not magic strings', () => {
    expect(DocumentType.PDF).toBe('PDF');
    expect(DocumentSourceType.SCANNED).toBe('SCANNED');
    expect(OCRProvider.OPENAI_VISION).toBe('OPENAI_VISION');
  });
});
