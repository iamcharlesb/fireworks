import type {
  BudgetController,
  BudgetDecision,
  BudgetLimit,
  BudgetUsage,
  ScopedBudgetController,
  ScopedBudgetLimit,
  ScopedBudgetUsage
} from "./base";

export interface BudgetManagerConfig {
  limits?: BudgetLimit[];
  scopedLimits?: ScopedBudgetLimit[];
}

export class BudgetManager implements BudgetController {
  private limits = new Map<string, number>();
  private usage = new Map<string, number>();

  constructor(config: BudgetManagerConfig = {}) {
    for (const limit of config.limits ?? []) {
      this.limits.set(limit.name, limit.max);
      this.usage.set(limit.name, 0);
    }
  }

  setLimit(name: string, max: number): void {
    this.limits.set(name, max);
    if (!this.usage.has(name)) {
      this.usage.set(name, 0);
    }
  }

  consume(name: string, amount = 1): BudgetDecision {
    const max = this.limits.get(name);
    if (max === undefined) {
      const usage: BudgetUsage = {
        name,
        used: amount,
        max: Number.POSITIVE_INFINITY,
        remaining: Number.POSITIVE_INFINITY
      };
      return { allowed: true, usage };
    }

    const current = this.usage.get(name) ?? 0;
    const next = current + amount;
    const usage: BudgetUsage = {
      name,
      used: next,
      max,
      remaining: Math.max(0, max - next)
    };

    if (next > max) {
      return {
        allowed: false,
        usage,
        reason: `Budget "${name}" exceeded: ${next}/${max}.`
      };
    }

    this.usage.set(name, next);
    return {
      allowed: true,
      usage
    };
  }

  getUsage(name: string): BudgetUsage | undefined {
    const max = this.limits.get(name);
    if (max === undefined) return undefined;

    const used = this.usage.get(name) ?? 0;
    return {
      name,
      used,
      max,
      remaining: Math.max(0, max - used)
    };
  }

  getAllUsage(): BudgetUsage[] {
    return Array.from(this.limits.keys())
      .map((name) => this.getUsage(name))
      .filter((usage): usage is BudgetUsage => usage !== undefined);
  }

  reset(name?: string): void {
    if (name) {
      this.usage.set(name, 0);
      return;
    }

    for (const key of this.limits.keys()) {
      this.usage.set(key, 0);
    }
  }
}

export class ScopedBudgetManager implements ScopedBudgetController {
  private global = new BudgetManager();
  private scopedLimits = new Map<string, number>();
  private scopedUsage = new Map<string, number>();

  constructor(config: BudgetManagerConfig = {}) {
    this.global = new BudgetManager({ limits: config.limits });
    for (const limit of config.scopedLimits ?? []) {
      this.setScopedLimit(limit.scope, limit.name, limit.max);
    }
  }

  private key(scope: string, name: string): string {
    return `${scope}::${name}`;
  }

  setLimit(name: string, max: number): void {
    this.global.setLimit(name, max);
  }

  setScopedLimit(scope: string, name: string, max: number): void {
    const key = this.key(scope, name);
    this.scopedLimits.set(key, max);
    if (!this.scopedUsage.has(key)) {
      this.scopedUsage.set(key, 0);
    }
  }

  consume(name: string, amount = 1): BudgetDecision {
    return this.global.consume(name, amount);
  }

  consumeScoped(scope: string, name: string, amount = 1): BudgetDecision {
    const key = this.key(scope, name);
    const max = this.scopedLimits.get(key);
    if (max === undefined) {
      const usage: ScopedBudgetUsage = {
        scope,
        name,
        used: amount,
        max: Number.POSITIVE_INFINITY,
        remaining: Number.POSITIVE_INFINITY
      };
      return { allowed: true, usage };
    }

    const current = this.scopedUsage.get(key) ?? 0;
    const next = current + amount;
    const usage: ScopedBudgetUsage = {
      scope,
      name,
      used: next,
      max,
      remaining: Math.max(0, max - next)
    };

    if (next > max) {
      return {
        allowed: false,
        usage,
        reason: `Budget "${name}" exceeded for scope "${scope}": ${next}/${max}.`
      };
    }

    this.scopedUsage.set(key, next);
    return { allowed: true, usage };
  }

  getUsage(name: string): BudgetUsage | undefined {
    return this.global.getUsage(name);
  }

  getUsageForScope(scope: string, name: string): ScopedBudgetUsage | undefined {
    const key = this.key(scope, name);
    const max = this.scopedLimits.get(key);
    if (max === undefined) return undefined;

    const used = this.scopedUsage.get(key) ?? 0;
    return {
      scope,
      name,
      used,
      max,
      remaining: Math.max(0, max - used)
    };
  }

  getAllUsage(): BudgetUsage[] {
    return this.global.getAllUsage();
  }

  getAllUsageForScope(scope: string): ScopedBudgetUsage[] {
    const prefix = `${scope}::`;
    return Array.from(this.scopedLimits.keys())
      .filter((key) => key.startsWith(prefix))
      .map((key) => this.getUsageForScope(scope, key.slice(prefix.length)))
      .filter((usage): usage is ScopedBudgetUsage => usage !== undefined);
  }

  reset(name?: string): void {
    this.global.reset(name);
  }

  resetScope(scope: string, name?: string): void {
    if (name) {
      this.scopedUsage.set(this.key(scope, name), 0);
      return;
    }

    const prefix = `${scope}::`;
    for (const key of this.scopedLimits.keys()) {
      if (key.startsWith(prefix)) {
        this.scopedUsage.set(key, 0);
      }
    }
  }
}
