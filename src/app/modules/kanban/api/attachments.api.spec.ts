import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { API_CONFIG } from '../../../core/config/api-config';
import { AttachmentsApi } from './attachments.api';

const API_BASE_URL = 'http://localhost:8000/api';
const FULL_PREFIX = `${API_BASE_URL}/v1`;
const attachmentsBase = (p: number, t: number, b: number, c: number, card: number) =>
  `${FULL_PREFIX}/projects/${p}/tasks/${t}/kanban/boards/${b}/columns/${c}/cards/${card}/attachments`;

function firstValueFrom<T>(source: import('rxjs').Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    source.subscribe({ next: resolve, error: reject });
  });
}

function buildFile(name: string, mime: string, sizeBytes: number): File {
  // Build a real File object with the requested size so the store + API
  // see realistic data.
  const buffer = new Uint8Array(Math.min(sizeBytes, 16));
  return new File([buffer], name, { type: mime });
}

describe('AttachmentsApi', () => {
  let httpMock: HttpTestingController;
  let api: AttachmentsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
        AttachmentsApi,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AttachmentsApi);
  });

  afterEach(() => httpMock.verify());

  it('listAttachments GETs and unwraps data (task-scoped URL chain)', async () => {
    const promise = firstValueFrom(api.listAttachments(7, 9, 4, 12, 87));
    const req = httpMock.expectOne(attachmentsBase(7, 9, 4, 12, 87));
    expect(req.request.method).toBe('GET');
    req.flush({
      data: [
        {
          id: 41,
          card_id: 87,
          uploader_id: 1,
          disk: 'local',
          path: 'kanban/cards/87/4f8e3b21-a1d2-4e88-b8b3-sample.png',
          original_filename: 'sample.png',
          mime: 'image/png',
          size_bytes: 12345,
          url: null,
          created_at: '2026-07-07T15:42:18.000000Z',
          updated_at: '2026-07-07T15:42:18.000000Z',
        },
      ],
      links: {},
      meta: {},
    });
    const list = await promise;
    expect(list).toHaveLength(1);
    expect(list[0]?.mime).toBe('image/png');
    expect(list[0]?.url).toBeNull();
  });

  it('uploadAttachment POSTs multipart/form-data with the file (task-scoped URL chain)', async () => {
    const file = buildFile('photo.png', 'image/png', 16);
    const promise = firstValueFrom(api.uploadAttachment(7, 9, 4, 12, 87, file));
    const req = httpMock.expectOne(attachmentsBase(7, 9, 4, 12, 87));
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    const form = req.request.body as FormData;
    expect(form.get('file')).toBeInstanceOf(Blob);
    req.flush({
      id: 42,
      card_id: 87,
      uploader_id: 1,
      disk: 'local',
      path: 'kanban/cards/87/4f8e3b21-a1d2-4e88-b8b3-photo.png',
      original_filename: 'photo.png',
      mime: 'image/png',
      size_bytes: 16,
      url: null,
      created_at: '2026-07-07T15:42:18.000000Z',
      updated_at: '2026-07-07T15:42:18.000000Z',
    });
    const created = await promise;
    expect(created.original_filename).toBe('photo.png');
  });

  it('deleteAttachment DELETEs by id under the task-scoped URL chain', async () => {
    const promise = firstValueFrom(api.deleteAttachment(7, 9, 4, 12, 87, 42));
    const req = httpMock.expectOne(`${attachmentsBase(7, 9, 4, 12, 87)}/42`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
  });

  it('422 attachment_mime_blocked surfaces as validation + typed code', async () => {
    const file = buildFile('photo.exe', 'application/octet-stream', 16);
    const promise = firstValueFrom(api.uploadAttachment(7, 9, 4, 12, 87, file));
    const req = httpMock.expectOne(attachmentsBase(7, 9, 4, 12, 87));
    req.flush(
      {
        message: 'Attachment mime is not allowed.',
        errors: { file: ['The file must be a file of type: jpg, jpeg, png, gif, webp, pdf, md, txt, zip.'] },
        code: 'attachment_mime_blocked',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await expect(promise).rejects.toEqual(
      expect.objectContaining({
        kind: 'validation',
        status: 422,
        code: 'attachment_mime_blocked',
      }),
    );
  });
});