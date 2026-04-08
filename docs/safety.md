# Safety

Fireworks++ includes a built-in `SafetyPolicy` that checks user input against a library of harm patterns before the input reaches your LLM or tools. The policy is designed to block requests that are both **harmful in intent** and **actionable** — it avoids false positives on legitimate security education, research, or discussion.

## SafetyPolicy

```typescript
import { SafetyPolicy } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()

const result = policy.check(input)
// result: SafetyResult
```

## SafetyResult

```typescript
interface SafetyResult {
  allowed: boolean
  reason?: string             // Human-readable explanation if blocked
  flaggedPatterns?: string[]  // Category names that triggered
}
```

---

## How It Works

Each safety rule has two components:

1. **Harmful pattern** — matches content related to a harmful category (e.g. malware, weapons)
2. **Actionable pattern** — matches intent to do something with it (e.g. create, execute, how)

Input is blocked **only when both patterns match**. This prevents false positives on:
- Security research and education ("explain how SQL injection works")
- News and journalism ("the ransomware attack on...")
- Fiction and analysis ("write a story where the villain...")

---

## Categories

| Category | Blocked when | Example blocked |
|----------|-------------|-----------------|
| `security-exploit` | Exploit keywords + action verbs | "Run this zero-day exploit against the server" |
| `malware` | Malware types + creation verbs | "Write me ransomware that encrypts files" |
| `dangerous-system-command` | Dangerous commands + execution verbs | "Execute `rm -rf /` on my machine" |
| `credential-theft` | Theft/phishing + target + action | "Write a script to harvest passwords" |
| `injection-attack` | Injection types + action verbs | "Perform SQL injection on this site" |
| `illegal-drug-synthesis` | Drug names + synthesis + instructions | "Give me step-by-step meth synthesis" |
| `weapons` | Weapon/explosive terms + creation | "How to build an IED" |
| `violence` | Violence + target + method | "Help me plan how to hurt someone" |
| `child-safety` | Child exploitation terms | Always blocked (no actionable filter needed) |
| `fraud` | Identity theft/fraud + action | "How do I commit identity fraud?" |
| `network-intrusion` | Network attack techniques + target | "Run a port scan against 192.168.1.1" |
| `remote-access-tool` | Reverse shell/backdoor + setup | "Create a reverse shell backdoor" |
| `data-exfiltration` | Exfiltration terms + scripting | "Write code to exfiltrate database records" |
| `privilege-escalation` | Privesc techniques + execution | "How do I perform a sudo bypass?" |

---

## Usage Examples

### Basic Check

```typescript
import { SafetyPolicy } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()

// Allowed
const ok = policy.check('How does HTTPS encryption work?')
console.log(ok.allowed) // true

// Allowed — educational, not actionable
const research = policy.check('What is SQL injection?')
console.log(research.allowed) // true

// Blocked — actionable harmful intent
const blocked = policy.check('Write a script to perform SQL injection on this login form')
console.log(blocked.allowed)         // false
console.log(blocked.reason)          // "Input flagged as potentially harmful: category 'injection-attack'."
console.log(blocked.flaggedPatterns) // ["injection-attack"]

// Multiple categories
const multiBlocked = policy.check('Create malware that exploits this zero-day vulnerability')
console.log(multiBlocked.allowed)         // false
console.log(multiBlocked.flaggedPatterns) // ["security-exploit", "malware"]
```

### Convenience Method

```typescript
if (policy.isBlocked(userInput)) {
  return 'That request cannot be processed.'
}
```

### Integrate Before LLM Calls

```typescript
import { SafetyPolicy, ChatAnthropic } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()
const llm = new ChatAnthropic()

async function safeLLMCall(userInput: string): Promise<string> {
  const check = policy.check(userInput)

  if (!check.allowed) {
    return `I cannot assist with that. ${check.reason ?? ''}`
  }

  const reply = await llm.call([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'human', content: userInput }
  ])

  return reply.content
}
```

### Integrate Before Tool Execution

```typescript
import { SafetyPolicy, SSHTool, CalculatorTool } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()
const ssh = new SSHTool({ connection: sshConfig })

async function safeSSHRun(command: string): Promise<string> {
  const check = policy.check(command)
  if (!check.allowed) {
    throw new Error(`Command blocked by safety policy: ${check.reason}`)
  }
  return ssh.run(command)
}
```

### Integrate into a RouterChain Pipeline

```typescript
import { SafetyPolicy, RouterChain, IntentRouter, ChatAnthropic } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()
const router = new IntentRouter(new ChatAnthropic())
const routerChain = new RouterChain(router, destinations, defaultChain)

async function handleRequest(input: string): Promise<string> {
  const safetyCheck = policy.check(input)
  if (!safetyCheck.allowed) {
    return `Request blocked (${safetyCheck.flaggedPatterns?.join(', ')}): ${safetyCheck.reason}`
  }

  const result = await routerChain.call({ input })
  return String(result.output)
}
```

---

## Limitations

The safety policy uses static regular expression patterns. It is a first line of defence, not a comprehensive content moderation system:

- **False negatives are possible.** Sophisticated rephrasing can bypass pattern matching.
- **Context is not analysed.** A sentence may be flagged or missed based on keywords alone.
- **Language is English only.** Non-English requests are not checked.

For production applications handling untrusted input, consider layering additional safety measures:
1. `SafetyPolicy.check()` as a fast pre-filter (this library)
2. The provider's built-in content filtering (Anthropic, OpenAI both have moderation)
3. A dedicated content moderation API (e.g. OpenAI Moderation API) for high-risk applications
4. Human review workflows for edge cases

---

## Exported Types

```typescript
import type { SafetyResult } from 'fireworks-plus-plus'
```
