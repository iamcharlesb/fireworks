import type {
  AuthorizationProvider,
  AuthorizationRequest,
  GovernanceDecision,
  GovernanceRole
} from "./base";

function matches(pattern: string | undefined, value: string): boolean {
  if (!pattern || pattern === "*") return true;
  return pattern === value;
}

export interface RBACAuthorizerConfig {
  roles?: GovernanceRole[];
  defaultAllow?: boolean;
}

export class RBACAuthorizer implements AuthorizationProvider {
  private roles = new Map<string, GovernanceRole>();
  private defaultAllow: boolean;

  constructor(config: RBACAuthorizerConfig = {}) {
    this.defaultAllow = config.defaultAllow ?? false;
    for (const role of config.roles ?? []) {
      this.roles.set(role.name, role);
    }
  }

  registerRole(role: GovernanceRole): void {
    this.roles.set(role.name, role);
  }

  async authorize(request: AuthorizationRequest): Promise<GovernanceDecision> {
    for (const roleName of request.actor.roles) {
      const role = this.roles.get(roleName);
      if (!role) continue;

      const matched = role.permissions.find(
        (permission) =>
          matches(permission.resourceType, request.resourceType) &&
          matches(permission.action, request.action) &&
          matches(permission.resourceId, request.resourceId)
      );

      if (matched) {
        return {
          allowed: true,
          reason: `Allowed by role "${roleName}".`,
          metadata: { role: roleName }
        };
      }
    }

    return {
      allowed: this.defaultAllow,
      reason: this.defaultAllow
        ? "Allowed by default authorizer policy."
        : `Actor "${request.actor.id}" is not permitted to ${request.action} ${request.resourceType}:${request.resourceId}.`
    };
  }
}
