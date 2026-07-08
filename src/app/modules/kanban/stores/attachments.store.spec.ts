import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import {
  AttachmentsApi,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_ALLOWLIST,
} from '../api/attachments.api';
import { AttachmentsStore } from './attachments.store';

const API_BASE_URL = 'http://localhost:8000/api';

function buildFile(name: string, mime: string, sizeBytes: number): File {
  // Real File with a small backing buffer — the store only reads `type`
  // and `size`, never the contents. Keep the buffer small to stay fast.
  const buffer = new Uint8Array(Math.min(sizeBytes, 16));
  return new File([buffer], name, { type: mime });
}

describe('AttachmentsStore — validate() pre-checks', () => {
  let store: AttachmentsStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        AttachmentsApi,
        AttachmentsStore,
      ],
    });
    store = TestBed.inject(AttachmentsStore);
  });

  it('accepts every mime in the 8-entry allowlist (api-doc §9.2)', () => {
    for (const mime of ATTACHMENT_MIME_ALLOWLIST) {
      const file = buildFile('test', mime, 1024);
      expect(store.validate(file).ok).toBe(true);
    }
    // Sanity: the allowlist has exactly 8 entries.
    expect(ATTACHMENT_MIME_ALLOWLIST.size).toBe(8);
  });

  it('rejects an .exe-style mime BEFORE the upload (no HTTP call)', () => {
    const file = buildFile('evil.exe', 'application/octet-stream', 1024);
    const validation = store.validate(file);
    expect(validation.ok).toBe(false);
    expect(validation.reason).toMatch(/not allowed/i);
  });

  it('rejects an unknown mime', () => {
    const file = buildFile('mystery', 'application/x-mystery', 1024);
    expect(store.validate(file).ok).toBe(false);
  });

  it('rejects a file > 5 MB BEFORE the upload', () => {
    // Build a file whose `.size` reports over the limit. We use a stub
    // for the actual bytes so the test is fast.
    const file = buildFile('big.bin', 'image/png', 1);
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: ATTACHMENT_MAX_BYTES + 1,
    });
    const validation = store.validate(file);
    expect(validation.ok).toBe(false);
    expect(validation.reason).toMatch(/max 5 mb/i);
  });

  it('accepts a file exactly at the 5 MB ceiling', () => {
    const file = buildFile('edge.png', 'image/png', 1);
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: ATTACHMENT_MAX_BYTES,
    });
    expect(store.validate(file).ok).toBe(true);
  });

  it('rejects a file with no detected mime (empty string)', () => {
    const file = buildFile('weird', '', 1024);
    expect(store.validate(file).ok).toBe(false);
  });
});