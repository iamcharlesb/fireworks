// ============================================================
// Fireworks++ — AgentExecutor
// Runs an agent in a Thought→Action→Observation loop until
// it reaches a final answer or exhausts the iteration budget.
// ============================================================

import { uuidv4 } from "../utils/uuid";
import type {
  AgentAction,
  AgentFinish,
  CallbackHandler,
  ChainValues,
  ExecutorOptions
} from "../schema/types";
import type { BaseTool } from "../tools/base";
import type { BaseAgent } from "./base";

/**
 * AgentExecutor orchestrates an agent loop:
 *  1. Ask the agent to plan the next step.
 *  2. If the agent returns AgentFinish, stop and return the result.
 *  3. If the agent returns AgentAction, find + run the named tool, record the
 *     observation, then go back to step 1.
 *  4. Stop after maxIterations regardless.
 */
export class AgentExecutor {
  private toolMap: Map<string, BaseTool>;
  private maxIterations: number;
  private returnIntermediateSteps: boolean;
  private earlyStoppingMethod: "force" | "generate";
  private handleParsingErrors: boolean;
  private verbose: boolean;

  constructor(
    private agent: BaseAgent,
    private tools: BaseTool[],
    private options: ExecutorOptions = {}
  ) {
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
    this.maxIterations = options.maxIterations ?? 15;
    this.returnIntermediateSteps = options.returnIntermediateSteps ?? false;
    this.earlyStoppingMethod = options.earlyStoppingMethod ?? "force";
    this.handleParsingErrors = options.handleParsingErrors ?? true;
    this.verbose = options.verbose ?? false;
  }

  // ------------------------------------------------------------------ public

  /**
   * Run the agent loop with structured inputs.
   * Returns ChainValues that always include an "output" key.
   */
  async call(
    inputs: ChainValues,
    callbacks: CallbackHandler[] = []
  ): Promise<ChainValues> {
    const runId = uuidv4();
    const intermediateSteps: Array<[AgentAction, string]> = [];

    if (this.verbose) {
      console.log(`[AgentExecutor] Starting run ${runId}`);
    }

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      let stepResult: AgentAction | AgentFinish;

      try {
        stepResult = await this.agent.plan(intermediateSteps, inputs);
      } catch (planError) {
        if (this.handleParsingErrors) {
          const errMsg =
            planError instanceof Error ? planError.message : String(planError);
          if (this.verbose) {
            console.warn(`[AgentExecutor] Plan error (handled): ${errMsg}`);
          }
          // Inject the error as an observation so the agent can recover
          const dummyAction: AgentAction = {
            tool: "__parse_error__",
            toolInput: "",
            log: `Error parsing agent output: ${errMsg}`
          };
          intermediateSteps.push([dummyAction, `Parse error: ${errMsg}. Please correct your output format.`]);
          continue;
        }
        throw planError;
      }

      // ---- Agent chose to finish ----
      if (this.isAgentFinish(stepResult)) {
        const finish = stepResult as AgentFinish;

        if (this.verbose) {
          console.log(`[AgentExecutor] Agent finished after ${iteration + 1} step(s).`);
        }

        for (const cb of callbacks) {
          await cb.onAgentFinish?.(finish, runId);
        }

        const result: ChainValues = { ...finish.returnValues };
        if (this.returnIntermediateSteps) {
          result["intermediateSteps"] = intermediateSteps;
        }
        return result;
      }

      // ---- Agent chose a tool action ----
      const action = stepResult as AgentAction;

      if (this.verbose) {
        console.log(
          `[AgentExecutor] Step ${iteration + 1}: tool="${action.tool}" input="${action.toolInput.slice(0, 120)}"`
        );
      }

      for (const cb of callbacks) {
        await cb.onAgentAction?.(action, runId);
      }

      const observation = await this.runTool(action, callbacks, runId);
      intermediateSteps.push([action, observation]);
    }

    // ---- Max iterations reached ----
    if (this.verbose) {
      console.warn(`[AgentExecutor] Reached max iterations (${this.maxIterations}).`);
    }

    if (this.earlyStoppingMethod === "generate") {
      // Ask the agent for a final answer based on what it has so far
      try {
        const forcedFinish = await this.agent.plan(intermediateSteps, {
          ...inputs,
          __force_finish__: true
        });
        if (this.isAgentFinish(forcedFinish)) {
          const finish = forcedFinish as AgentFinish;
          for (const cb of callbacks) {
            await cb.onAgentFinish?.(finish, runId);
          }
          const result: ChainValues = { ...finish.returnValues };
          if (this.returnIntermediateSteps) {
            result["intermediateSteps"] = intermediateSteps;
          }
          return result;
        }
      } catch {
        // Fall through to force-stop
      }
    }

    const forcedOutput =
      "Agent stopped due to reaching the maximum number of iterations.";
    const forcedFinish: AgentFinish = {
      returnValues: { output: forcedOutput },
      log: forcedOutput
    };
    for (const cb of callbacks) {
      await cb.onAgentFinish?.(forcedFinish, runId);
    }

    const result: ChainValues = { output: forcedOutput };
    if (this.returnIntermediateSteps) {
      result["intermediateSteps"] = intermediateSteps;
    }
    return result;
  }

  /**
   * Convenience method: pass a single string, get a string back.
   */
  async run(input: string, callbacks: CallbackHandler[] = []): Promise<string> {
    const result = await this.call({ input }, callbacks);
    const output = result["output"];
    return typeof output === "string" ? output : String(output ?? "");
  }

  // ------------------------------------------------------------------ private

  private isAgentFinish(step: AgentAction | AgentFinish): step is AgentFinish {
    return "returnValues" in step;
  }

  /**
   * Execute the tool named in the action.  Returns the observation string.
   * Errors are caught and returned as observations so the agent can recover.
   */
  private async runTool(
    action: AgentAction,
    callbacks: CallbackHandler[],
    _runId: string
  ): Promise<string> {
    const tool = this.toolMap.get(action.tool);

    if (!tool) {
      const errorMsg = `Tool "${action.tool}" not found. Available tools: ${[...this.toolMap.keys()].join(", ")}`;
      if (this.verbose) {
        console.warn(`[AgentExecutor] ${errorMsg}`);
      }
      return errorMsg;
    }

    try {
      const output = await tool.run(action.toolInput, callbacks);
      return output;
    } catch (toolError) {
      const errMsg =
        toolError instanceof Error ? toolError.message : String(toolError);
      if (this.verbose) {
        console.warn(`[AgentExecutor] Tool "${action.tool}" errored: ${errMsg}`);
      }
      return `Tool error: ${errMsg}`;
    }
  }
}
