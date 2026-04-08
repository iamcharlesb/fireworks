// ============================================================
// Fireworks++ — StreamingCallbackHandler
// Collects and forwards tokens as they stream from an LLM.
// ============================================================

import { BaseCallbackHandler } from "./base";

/**
 * StreamingCallbackHandler receives each token as the LLM streams its response,
 * forwards it to a caller-supplied onToken callback, and accumulates a full buffer
 * that can be retrieved once streaming completes.
 */
export class StreamingCallbackHandler extends BaseCallbackHandler {
  private buffer: string = "";

  /**
   * @param onToken - Called for every new token received from the LLM.
   */
  constructor(private onToken: (token: string) => void) {
    super();
  }

  /**
   * Called for each streaming token.  Appends to the internal buffer and
   * forwards the token to the onToken callback.
   */
  override async onLLMNewToken(token: string, _runId: string): Promise<void> {
    this.buffer += token;
    this.onToken(token);
  }

  /**
   * Returns the full accumulated text received so far.
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Clears the internal buffer, ready for a new streaming session.
   */
  reset(): void {
    this.buffer = "";
  }
}
