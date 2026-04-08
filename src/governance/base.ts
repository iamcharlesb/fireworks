export interface GovernanceActor {
  id: string;
  roles: string[];
  attributes?: Record<string, unknown>;
}

export interface AuthorizationRequest {
  actor: GovernanceActor;
  resourceType: string;
  resourceId: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export interface GovernanceDecision {
  allowed: boolean;
  reason?: string;
  matchedRuleIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface GovernancePermission {
  resourceType: string;
  action: string;
  resourceId?: string;
}

export interface GovernanceRole {
  name: string;
  permissions: GovernancePermission[];
}

export interface GovernanceRuleContext {
  request?: AuthorizationRequest;
  actor?: GovernanceActor;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  inputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

export interface GovernanceRule {
  id: string;
  effect: "allow" | "deny";
  description?: string;
  evaluate(context: GovernanceRuleContext): boolean | Promise<boolean>;
}

export interface AuthorizationProvider {
  authorize(request: AuthorizationRequest): Promise<GovernanceDecision>;
}

export interface PolicyProvider {
  evaluate(context: GovernanceRuleContext): Promise<GovernanceDecision>;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: string;
  status: "info" | "success" | "warning" | "error";
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuditEventFilter {
  type?: string;
  status?: AuditEvent["status"];
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
}

export interface AuditLogger {
  record(event: AuditEvent): Promise<void>;
  list(filter?: AuditEventFilter): Promise<AuditEvent[]>;
  clear(): Promise<void>;
}

export interface BudgetLimit {
  name: string;
  max: number;
}

export interface ScopedBudgetLimit extends BudgetLimit {
  scope: string;
}

export interface BudgetUsage {
  name: string;
  used: number;
  max: number;
  remaining: number;
}

export interface ScopedBudgetUsage extends BudgetUsage {
  scope: string;
}

export interface BudgetDecision {
  allowed: boolean;
  usage: BudgetUsage;
  reason?: string;
}

export interface BudgetController {
  consume(name: string, amount?: number): BudgetDecision;
  getUsage(name: string): BudgetUsage | undefined;
  getAllUsage(): BudgetUsage[];
  reset(name?: string): void;
}

export interface ScopedBudgetController extends BudgetController {
  consumeScoped(scope: string, name: string, amount?: number): BudgetDecision;
  getUsageForScope(scope: string, name: string): ScopedBudgetUsage | undefined;
  getAllUsageForScope(scope: string): ScopedBudgetUsage[];
  setScopedLimit(scope: string, name: string, max: number): void;
  resetScope(scope: string, name?: string): void;
}
