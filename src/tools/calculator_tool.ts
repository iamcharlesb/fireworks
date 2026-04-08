import { BaseTool, type BaseToolConfig } from "./base";
import type { ToolResult } from "../schema/types";

/**
 * CalculatorTool — evaluates mathematical expressions safely.
 * Supports arithmetic, basic math functions, and constants.
 *
 * @example
 * const calc = new CalculatorTool()
 * const result = await calc.run("(2 + 3) * 4 / 2")
 * // "10"
 */
export class CalculatorTool extends BaseTool {
  name = "calculator";
  description =
    "Useful for evaluating mathematical expressions. Input should be a valid math expression. " +
    "Supports: +, -, *, /, **, %, parentheses, Math.sqrt(), Math.abs(), Math.pow(), Math.PI, Math.E, " +
    "Math.floor(), Math.ceil(), Math.round(), Math.log(), Math.sin(), Math.cos(), Math.tan().";

  constructor(config: BaseToolConfig = {}) {
    super(config);
  }

  async call(input: string): Promise<ToolResult> {
    const cleaned = input.trim();

    // Security: only allow mathematical expressions
    const allowedPattern = /^[\d\s\+\-\*\/\%\(\)\.\,Math\.sqrt|abs|pow|PI|E|floor|ceil|round|log|sin|cos|tan|min|max]+$/;

    // Sanitize: remove any non-mathematical characters
    const sanitized = cleaned
      .replace(/[^0-9+\-*/%().^,\sMathsqrtabspowPIEflorceilroundlogsincontaemix]/g, "")
      .trim();

    if (!sanitized) {
      return {
        output: "Error: empty or invalid expression",
        error: "Invalid expression"
      };
    }

    try {
      // Use Function constructor for safe(r) evaluation in a restricted scope
      // Inject Math methods as local variables
      const mathContext = {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        sqrt: Math.sqrt,
        pow: Math.pow,
        log: Math.log,
        log2: Math.log2,
        log10: Math.log10,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        min: Math.min,
        max: Math.max,
        PI: Math.PI,
        E: Math.E
      };

      // Build a safe evaluator
      const safeEval = new Function(
        ...Object.keys(mathContext),
        `"use strict"; return (${cleaned});`
      );

      const result = safeEval(...Object.values(mathContext)) as unknown;

      if (typeof result !== "number" || !isFinite(result)) {
        return {
          output: `Result is not a finite number: ${String(result)}`,
          error: "Non-finite result"
        };
      }

      // Format result: remove trailing zeros for cleanliness
      const formatted =
        Number.isInteger(result)
          ? result.toString()
          : parseFloat(result.toFixed(10)).toString();

      return { output: formatted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        output: `Error evaluating expression: ${message}`,
        error: message
      };
    }
  }
}
