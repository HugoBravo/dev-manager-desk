/**
 * Wire shape of a User resource. Mirrors the backend contract documented in
 * `dev-manager-backend/app/Http/Resources/UserResource.php`.
 *
 * `password` is write-only at the API and is NEVER returned in the response,
 * so this interface intentionally omits it. Forms that allow a password change
 * accept it locally and discard it after the PATCH.
 */
export interface User {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly email_verified_at: string | null;
  readonly is_admin: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Payload for {@link UsersApi.create}. `is_admin` defaults to `false` server-side;
 * sending it as `undefined` omits the field from the request.
 */
export interface CreateUserPayload {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly is_admin?: boolean;
}

/**
 * Payload for {@link UsersApi.update}. Every field is optional; the backend
 * only mutates the keys present in the request body (`sometimes`).
 */
export interface UpdateUserPayload {
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
  readonly is_admin?: boolean;
}
