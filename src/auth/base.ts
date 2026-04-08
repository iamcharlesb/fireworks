import type { GovernanceActor } from "../governance";

export interface AuthClaims {
  sub: string;
  email?: string;
  roles?: string[];
  teams?: string[];
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface AuthSession {
  actor: GovernanceActor;
  claims: AuthClaims;
}

export interface Authenticator {
  authenticate(headers: Record<string, string | string[] | undefined>): Promise<AuthSession | undefined>;
}

