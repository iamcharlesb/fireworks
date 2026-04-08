import type {
  GovernanceDecision,
  GovernanceRule,
  GovernanceRuleContext,
  PolicyProvider
} from "./base";

export interface PolicyEngineConfig {
  rules?: GovernanceRule[];
  defaultAllow?: boolean;
}

export class PolicyEngine implements PolicyProvider {
  private rules: GovernanceRule[];
  private defaultAllow: boolean;

  constructor(config: PolicyEngineConfig = {}) {
    this.rules = config.rules ?? [];
    this.defaultAllow = config.defaultAllow ?? true;
  }

  registerRule(rule: GovernanceRule): void {
    this.rules.push(rule);
  }

  async evaluate(context: GovernanceRuleContext): Promise<GovernanceDecision> {
    const matchedRuleIds: string[] = [];

    for (const rule of this.rules) {
      if (!(await rule.evaluate(context))) {
        continue;
      }

      matchedRuleIds.push(rule.id);
      if (rule.effect === "deny") {
        return {
          allowed: false,
          reason: rule.description ?? `Blocked by policy rule "${rule.id}".`,
          matchedRuleIds
        };
      }
    }

    return {
      allowed: this.defaultAllow,
      reason:
        matchedRuleIds.length > 0
          ? `Allowed by policy rules: ${matchedRuleIds.join(", ")}.`
          : this.defaultAllow
          ? "Allowed by default policy."
          : "Blocked because no allow policy matched.",
      matchedRuleIds
    };
  }
}
