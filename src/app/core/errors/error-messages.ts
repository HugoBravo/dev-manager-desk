/**
 * User-facing i18n messages for each {@link ApiError.kind}. Kept in a single
 * flat object (no `@angular/localize` yet) so the structure is ready for
 * extraction later. The keys here are the only place UI copy is defined.
 *
 * `notFound` returns ONE string regardless of whether the original cause was
 * a missing resource or a cross-owner access attempt. This is the existence-
 * leak prevention contract.
 */
export const ERROR_MESSAGES = {
  network: 'Could not reach the server. Check your connection and try again.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You are not allowed to perform this action.',
  editWindowExpired: 'The edit window for this comment has expired.',
  notFound: 'Not found or you do not have access.',
  validation: 'Some fields are invalid. Please review and try again.',
  validationField: (field: string, first: string): string =>
    `${field}: ${first}`,
  conflictBoardHasContents:
    'This board still has columns. Move or delete them first.',
  conflictColumnHasContents:
    'This column still has cards. Move or delete them first.',
  conflictGeneric: 'This action conflicts with the current state.',
  positionExhausted:
    'Server ran out of room to position items. Please retry.',
  attachmentMimeBlocked:
    'This file type is not allowed. Please use a supported format.',
  rateLimited: 'Too many requests. Please wait a moment and try again.',
  serverError: 'The server ran into a problem. Please try again later.',
  httpGeneric: (status: number): string =>
    `Unexpected error (${status}). Please try again.`,
} as const;
