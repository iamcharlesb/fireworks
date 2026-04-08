// ============================================================
// Fireworks++ — SafetyPolicy
// Content filtering: only blocks input that is BOTH harmful AND actionable.
// ============================================================

import type { SafetyResult } from "../schema/types";

interface PolicyPattern {
  pattern: RegExp;
  category: string;
  actionable: RegExp[];
}

export class SafetyPolicy {
  private patterns: PolicyPattern[];

  constructor() {
    this.patterns = [
      // Security exploits and hacking
      {
        pattern: /\b(hack|exploit|pwn|0day|zero.?day|vulnerability|bypass|jailbreak)\b/i,
        category: "security-exploit",
        actionable: [/\b(run|execute|deploy|inject|bypass|launch|trigger|activate)\b/i]
      },
      // Malware and ransomware
      {
        pattern: /\b(malware|ransomware|spyware|keylogger|rootkit|botnet|trojan|worm|virus)\b/i,
        category: "malware",
        actionable: [/\b(create|write|build|deploy|install|spread|distribute|compile|generate)\b/i]
      },
      // Dangerous system-level commands
      {
        pattern: /\b(rm\s+-rf|format\s+[a-z]:|\bdd\s+if=|mkfs\.|fork\s*bomb|:.*\(\)\s*\{.*\})\b/i,
        category: "dangerous-system-command",
        actionable: [/\b(run|execute|perform|do|apply|use|invoke)\b/i]
      },
      // Credential theft and phishing
      {
        pattern: /\b(steal|harvest|phish|scrape|exfiltrate)\b.*\b(password|credential|token|secret|api.?key|auth)\b/i,
        category: "credential-theft",
        actionable: [/\b(how|script|code|automate|write|build|create|make)\b/i]
      },
      // Session hijacking and cookie theft
      {
        pattern: /\b(steal|capture|grab|extract|dump|exfiltrate)\b.*\b(session\s+cookies?|cookies?|session\s+tokens?)\b/i,
        category: "session-hijacking",
        actionable: [/\b(how|script|code|automate|write|build|create|make|log\s+in(?:to)?|login(?:\s+to)?)\b/i]
      },
      // SQL injection / code injection
      {
        pattern: /\b(sql\s*injection|xss|cross.?site|csrf|command\s*injection|ldap\s*injection|xml\s*injection)\b/i,
        category: "injection-attack",
        actionable: [/\b(perform|execute|craft|create|write|use|do|run)\b/i]
      },
      // Illegal drug synthesis
      {
        pattern: /\b(synthesize|manufacture|produce|cook)\b.*\b(meth|methamphetamine|heroin|cocaine|fentanyl|lsd|mdma)\b/i,
        category: "illegal-drug-synthesis",
        actionable: [/\b(how|step|instruction|guide|process|method|procedure)\b/i]
      },
      // Weapons and explosives
      {
        pattern: /\b(explosive|bomb|improvised\s+explosive|ied|pipe\s+bomb|grenade|bioweapon|chemical\s+weapon)\b/i,
        category: "weapons",
        actionable: [/\b(make|build|create|construct|assemble|synthesize|instructions|how\s+to)\b/i]
      },
      // Violence and harm to people
      {
        pattern: /\b(murder|assassinate|kill|harm|hurt|torture|kidnap|stalk)\b.*\b(person|people|individual|target|victim|someone)\b/i,
        category: "violence",
        actionable: [/\b(how|plan|help|assist|guide|instruct|step|method)\b/i]
      },
      // Child safety
      {
        pattern: /\b(child|minor|underage|juvenile)\b.*\b(sexual|exploit|groom|abuse|molest)\b/i,
        category: "child-safety",
        actionable: [/.*/] // always actionable — category is inherently harmful
      },
      // Identity theft / fraud
      {
        pattern: /\b(identity\s*theft|social\s*engineering|impersonate|forge|counterfeit|fraud)\b/i,
        category: "fraud",
        actionable: [/\b(how|commit|perform|execute|conduct|do|help|assist|guide)\b/i]
      },
      // Network intrusion / port scanning offensively
      {
        pattern: /\b(port\s*scan|network\s*sniff|packet\s*intercept|arp\s*spoof|man.in.the.middle|mitm)\b/i,
        category: "network-intrusion",
        actionable: [/\b(run|perform|execute|against|on|target|do)\b/i]
      },
      // Reverse shell / backdoor
      {
        pattern: /\b(reverse\s*shell|bind\s*shell|backdoor|c2\s*server|command.and.control|netcat.*-e|bash\s+-i\s+>&)\b/i,
        category: "remote-access-tool",
        actionable: [/\b(create|set.?up|establish|open|start|run|launch|connect)\b/i]
      },
      // Data exfiltration
      {
        pattern: /\b(exfiltrate|exfil|leak|dump)\b.*\b(data|database|records|emails|files|credentials)\b/i,
        category: "data-exfiltration",
        actionable: [/\b(how|write|code|script|automate|perform)\b/i]
      },
      // Privilege escalation
      {
        pattern: /\b(privilege\s*escalation|privesc|root\s*exploit|sudo\s*bypass|suid\s*exploit)\b/i,
        category: "privilege-escalation",
        actionable: [/\b(use|exploit|execute|how|perform|do)\b/i]
      }
    ];
  }

  /**
   * Check the input against all registered safety patterns.
   * Returns a SafetyResult indicating whether the input is allowed.
   * Input is blocked only when it matches BOTH a harmful pattern AND an actionable pattern.
   */
  check(input: string): SafetyResult {
    const flaggedCategories: string[] = [];

    for (const entry of this.patterns) {
      if (!entry.pattern.test(input)) {
        continue;
      }

      // Check if any actionable pattern also matches
      const isActionable = entry.actionable.some((ap) => ap.test(input));
      if (isActionable) {
        flaggedCategories.push(entry.category);
      }
    }

    if (flaggedCategories.length === 0) {
      return { allowed: true };
    }

    const reason =
      flaggedCategories.length === 1
        ? `Input flagged as potentially harmful: category "${flaggedCategories[0]}".`
        : `Input flagged as potentially harmful across ${flaggedCategories.length} categories: ${flaggedCategories.join(", ")}.`;

    return {
      allowed: false,
      reason,
      flaggedPatterns: flaggedCategories
    };
  }

  /**
   * Convenience method — returns true when the input should be blocked.
   */
  isBlocked(input: string): boolean {
    return !this.check(input).allowed;
  }
}
