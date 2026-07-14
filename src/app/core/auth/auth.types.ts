export interface User {
  readonly id: number | string;
  readonly email: string;
  readonly name: string;
  readonly email_verified_at: string | null;
  /**
   * Mirrors `users.is_admin` from the backend. Optional for backward
   * compatibility with cached sessions that predate the
   * `user-administration` capability — `AuthService` treats `undefined`
   * as `false`.
   */
  readonly is_admin?: boolean;
}

export interface AuthTokens {
  readonly token: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly device_name: string;
}

/** Wire shape returned by POST /api/auth/login (flat — NOT wrapped in `data`). */
export interface AuthResponse {
  readonly user: User;
  readonly token: string;
}

/** Wire shape returned by GET /api/user (wrapped in `data`). */
export interface UserResponse {
  readonly data: User;
}

export type LoginResult =
  | { readonly ok: true; readonly user: User }
  | {
      readonly ok: false;
      readonly error: string;
      readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
    };
