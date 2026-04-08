import crypto from "crypto";
import type { AuthClaims, AuthSession, Authenticator } from "./base";

function base64UrlDecode(value: string): string {
  const padding = (4 - (value.length % 4)) % 4;
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);
  return Buffer.from(normalized, "base64").toString("utf8");
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export interface HS256AuthenticatorConfig {
  secret: string;
  issuer?: string;
  audience?: string;
  roleClaim?: string;
  teamClaim?: string;
}

export class HS256Authenticator implements Authenticator {
  private secret: string;
  private issuer?: string;
  private audience?: string;
  private roleClaim: string;
  private teamClaim: string;

  constructor(config: HS256AuthenticatorConfig) {
    this.secret = config.secret;
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.roleClaim = config.roleClaim ?? "roles";
    this.teamClaim = config.teamClaim ?? "teams";
  }

  static sign(claims: AuthClaims, secret: string): string {
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(claims));
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
  }

  async authenticate(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthSession | undefined> {
    const authorization = headers["authorization"];
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value || !value.startsWith("Bearer ")) {
      return undefined;
    }

    const token = value.slice("Bearer ".length).trim();
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Malformed bearer token.");
    }

    const [headerSegment, payloadSegment, signatureSegment] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", this.secret)
      .update(`${headerSegment}.${payloadSegment}`)
      .digest();

    if (base64UrlEncode(expectedSignature) !== signatureSegment) {
      throw new Error("Bearer token signature verification failed.");
    }

    const claims = JSON.parse(base64UrlDecode(payloadSegment)) as AuthClaims;

    if (this.issuer && claims.iss !== this.issuer) {
      throw new Error(`Unexpected token issuer "${claims.iss ?? "unknown"}".`);
    }

    if (this.audience) {
      const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
      if (!audiences.includes(this.audience)) {
        throw new Error(`Unexpected token audience "${audiences.join(",")}".`);
      }
    }

    if (claims.exp && claims.exp * 1000 < Date.now()) {
      throw new Error("Bearer token has expired.");
    }

    const roles = Array.isArray(claims[this.roleClaim]) ? (claims[this.roleClaim] as string[]) : claims.roles ?? [];
    const teams = Array.isArray(claims[this.teamClaim]) ? (claims[this.teamClaim] as string[]) : claims.teams ?? [];

    return {
      actor: {
        id: claims.sub,
        roles,
        attributes: {
          email: claims.email,
          teams
        }
      },
      claims
    };
  }
}

export interface SAMLAttributeMapperConfig {
  subjectAttribute?: string;
  roleAttribute?: string;
  teamAttribute?: string;
}

export class SAMLAttributeMapper {
  private subjectAttribute: string;
  private roleAttribute: string;
  private teamAttribute: string;

  constructor(config: SAMLAttributeMapperConfig = {}) {
    this.subjectAttribute = config.subjectAttribute ?? "nameID";
    this.roleAttribute = config.roleAttribute ?? "roles";
    this.teamAttribute = config.teamAttribute ?? "teams";
  }

  map(attributes: Record<string, unknown>): AuthSession {
    const subject = String(attributes[this.subjectAttribute] ?? "");
    if (!subject) {
      throw new Error(`Missing SAML subject attribute "${this.subjectAttribute}".`);
    }

    const roles = Array.isArray(attributes[this.roleAttribute])
      ? (attributes[this.roleAttribute] as string[])
      : attributes[this.roleAttribute]
      ? [String(attributes[this.roleAttribute])]
      : [];
    const teams = Array.isArray(attributes[this.teamAttribute])
      ? (attributes[this.teamAttribute] as string[])
      : attributes[this.teamAttribute]
      ? [String(attributes[this.teamAttribute])]
      : [];

    return {
      actor: {
        id: subject,
        roles,
        attributes: {
          teams,
          samlAttributes: attributes
        }
      },
      claims: {
        sub: subject,
        roles,
        teams
      }
    };
  }
}

