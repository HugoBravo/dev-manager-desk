/**
 * Wire shape of a Secret resource. Matches the backend contract documented
 * in `dev-manager-backend/app/Http/Resources/SecretResource.php`.
 *
 * `description` is nullable on the wire — the backend `Secret` model permits
 * `description` to be `null` and the editor normalizes empty-after-trim
 * descriptions to `null` before POSTing.
 *
 * The backend encrypts `value` at rest (Laravel `encrypted` cast). The
 * plaintext is only ever carried over HTTPS; the UI must not log or persist
 * it beyond the lifetime of the user reveal action.
 */
export interface Secret {
  readonly id: number;
  readonly project_id: number;
  readonly key: string;
  readonly value: string;
  readonly description: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Payload for {@link SecretsApi.create}. `description` is normalized to
 * `null` when omitted so the nullable backend column receives JSON null
 * (not `undefined`).
 */
export interface CreateSecretPayload {
  readonly key: string;
  readonly value: string;
  readonly description?: string | null;
}

/**
 * Payload for {@link SecretsApi.update}. `value` and `description` are the
 * only mutable fields (the backend `UpdateSecretRequest` does NOT accept
 * `key` — that field is immutable once created).
 */
export interface UpdateSecretPayload {
  readonly value?: string;
  readonly description?: string | null;
}
