import {
  BaseChatModel,
  DynamicTool,
  InMemoryAuditLogger,
  PolicyEngine,
  RBACAuthorizer,
  ToolCallingAgent,
  ToolCallingAgentExecutor
} from "../src";
import type { FunctionDefinition, LLMResult, Message, RunOptions } from "../src";

class GovernanceDemoModel extends BaseChatModel {
  modelName = "governance-demo";

  _modelType(): string {
    return "governance-demo";
  }

  async generate(messageBatches: Message[][], _options?: RunOptions): Promise<LLMResult> {
    const messages = messageBatches[0];
    const hasToolObservation = messages.some((message) => message.role === "tool");

    if (hasToolObservation) {
      const finalText = "The SSH action was blocked by governance before it could execute.";
      return {
        generations: [[{ text: finalText, message: { role: "ai" as const, content: finalText } }]]
      };
    }

    return {
      generations: [
        [
          {
            text: "",
            message: {
              role: "ai" as const,
              content: "",
              toolCalls: [
                {
                  id: "call_ssh_1",
                  name: "ssh",
                  arguments: JSON.stringify({ command: "rm -rf /tmp/example" })
                }
              ]
            }
          }
        ]
      ]
    };
  }

  async callWithTools(messages: Message[], _tools: FunctionDefinition[]): Promise<Message> {
    const result = await this.generate([messages]);
    return result.generations[0][0].message ?? { role: "ai", content: result.generations[0][0].text };
  }
}

async function main(): Promise<void> {
  const audit = new InMemoryAuditLogger();
  const authorizer = new RBACAuthorizer({
    roles: [
      {
        name: "viewer",
        permissions: []
      }
    ]
  });
  const policies = new PolicyEngine({
    rules: [
      {
        id: "block-ssh",
        effect: "deny",
        description: "SSH is disabled for this environment.",
        evaluate(context) {
          return context.resourceType === "tool" && context.resourceId === "ssh";
        }
      }
    ]
  });

  const sshTool = new DynamicTool({
    name: "ssh",
    description: "Execute a shell command on a remote host.",
    func: async () => ({ output: "This should never run." })
  });

  const agent = new ToolCallingAgent(new GovernanceDemoModel(), [sshTool]);
  const executor = new ToolCallingAgentExecutor(agent, {
    actor: { id: "eve", roles: ["viewer"] },
    authorizer,
    policyEngine: policies,
    auditLogger: audit
  });

  const result = await executor.call({
    input: "Delete a temporary file over SSH."
  });

  console.log("Agent output:", result.output);
  console.log("Audit events:");
  for (const event of await audit.list()) {
    console.log(`- ${event.type}: ${event.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
