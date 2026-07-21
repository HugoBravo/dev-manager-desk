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

export interface UserResourceData extends User {
  readonly is_admin: boolean;
}

export interface AuthTokens {
  readonly token: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly device_name: string;
}

export interface AuthResponse {
  readonly user: User;
  readonly token: string;
}

export interface AuthWireResponse {
  readonly user: UserResponse;
  readonly token: string;
}

export interface UserResponse {
  readonly data: UserResourceData;
}

export type LoginResult =
  | { readonly ok: true; readonly user: User }
  | {
      readonly ok: false;
      readonly error: string;
      readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
    };
