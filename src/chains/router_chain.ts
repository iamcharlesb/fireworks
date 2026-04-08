import { BaseChain, type BaseChainConfig } from "./base";
import type { ChainValues } from "../schema/types";
import type { IntentRouter } from "../routing/intent_router";

export interface RouterChainConfig extends BaseChainConfig {
  defaultKey?: string;
}

/**
 * RouterChain — routes inputs to different destination chains based on intent.
 * Inspired by topcode's intent router architecture.
 *
 * @example
 * const router = new IntentRouter()
 * const destinations = {
 *   research: researchChain,
 *   llm: generalChain,
 *   calculator: calcChain
 * }
 * const routerChain = new RouterChain(router, destinations, generalChain)
 * const result = await routerChain.call({ input: "What is 42 * 7?" })
 */
export class RouterChain extends BaseChain {
  inputKeys: string[] = ["input"];
  outputKeys: string[] = ["output", "destination"];

  private intentRouter: IntentRouter;
  private destinations: Record<string, BaseChain>;
  private defaultChain: BaseChain;

  constructor(
    intentRouter: IntentRouter,
    destinations: Record<string, BaseChain>,
    defaultChain: BaseChain,
    config: RouterChainConfig = {}
  ) {
    super(config);
    this.intentRouter = intentRouter;
    this.destinations = destinations;
    this.defaultChain = defaultChain;
  }

  _chainType(): string {
    return "router_chain";
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    const input = String(inputs["input"] ?? "");

    // Determine which chain to route to
    const routeDecision = await this.intentRouter.route(input);

    if (this.verbose) {
      console.log(
        `[RouterChain] Routing "${input.slice(0, 60)}" → ${routeDecision.kind} (${routeDecision.confidence.toFixed(2)})`
      );
    }

    const destinationChain = this.destinations[routeDecision.kind] ?? this.defaultChain;
    const destinationInputKey = destinationChain.inputKeys[0] ?? "input";
    const destinationOutputKey = destinationChain.outputKeys[0] ?? "output";

    const result = await destinationChain.call(
      { [destinationInputKey]: input },
      this.callbacks
    );

    return {
      output: result[destinationOutputKey] ?? result,
      destination: routeDecision.kind
    };
  }
}

/**
 * MultiRouteChain — extends RouterChain with additional metadata routing.
 * Passes through all inputs and includes routing metadata in output.
 */
export class MultiRouteChain extends BaseChain {
  inputKeys: string[] = ["input"];
  outputKeys: string[] = ["output", "destination", "confidence"];

  private intentRouter: IntentRouter;
  private destinations: Record<string, BaseChain>;
  private defaultChain: BaseChain;

  constructor(
    intentRouter: IntentRouter,
    destinations: Record<string, BaseChain>,
    defaultChain: BaseChain,
    config: BaseChainConfig = {}
  ) {
    super(config);
    this.intentRouter = intentRouter;
    this.destinations = destinations;
    this.defaultChain = defaultChain;
  }

  _chainType(): string {
    return "multi_route_chain";
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    const input = String(inputs["input"] ?? "");

    const routeDecision = await this.intentRouter.routeWithConfidence(input);

    if (this.verbose) {
      console.log(
        `[MultiRouteChain] Route: ${routeDecision.kind} (confidence: ${routeDecision.confidence.toFixed(2)})`
      );
    }

    const destinationChain =
      this.destinations[routeDecision.kind] ?? this.defaultChain;
    const destinationInputKey = destinationChain.inputKeys[0] ?? "input";
    const destinationOutputKey = destinationChain.outputKeys[0] ?? "output";

    const mergedInputs = { ...inputs, [destinationInputKey]: input };
    const result = await destinationChain.call(mergedInputs, this.callbacks);

    return {
      output: result[destinationOutputKey] ?? result,
      destination: routeDecision.kind,
      confidence: routeDecision.confidence,
      reasoning: routeDecision.reasoning
    };
  }
}
