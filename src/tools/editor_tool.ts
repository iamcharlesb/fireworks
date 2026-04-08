import { BaseTool, type BaseToolConfig } from "./base";
import type { ToolResult } from "../schema/types";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface EditorToolConfig extends BaseToolConfig {
  workspacePath?: string;
  openInEditor?: boolean;
  editor?: string;
}

/**
 * EditorTool — read, write, and edit files in a workspace.
 *
 * Input format (JSON):
 * {
 *   "action": "read" | "write" | "append" | "patch" | "open",
 *   "path": "relative/or/absolute/path.ts",
 *   "content": "new content...",     // for write/append
 *   "oldContent": "...",             // for patch (find & replace)
 *   "newContent": "...",             // for patch
 *   "line": 42                       // for open (jump to line)
 * }
 *
 * @example
 * const editor = new EditorTool({ workspacePath: "/path/to/project" })
 * await editor.run(JSON.stringify({ action: "read", path: "src/index.ts" }))
 */
export class EditorTool extends BaseTool {
  name = "editor";
  description =
    "Read, write, and edit files in the workspace. " +
    'Input must be JSON: {"action": "read|write|append|patch|open", "path": "...", "content": "..."}. ' +
    "For patch: provide oldContent and newContent. For open: launches the file in the system editor.";

  private workspacePath: string;
  private openInEditor: boolean;
  private editor: string;

  constructor(config: EditorToolConfig = {}) {
    super(config);
    this.workspacePath = config.workspacePath ?? process.cwd();
    this.openInEditor = config.openInEditor ?? false;
    this.editor = config.editor ?? process.env.EDITOR ?? "code";
  }

  private resolvePath(filePath: string): string {
    const workspaceRoot = resolve(this.workspacePath);
    const resolved = resolve(workspaceRoot, filePath);
    const relativePath = relative(workspaceRoot, resolved);

    // Security: ensure the canonical path stays inside the configured workspace.
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`Path traversal detected: ${filePath} is outside workspace`);
    }
    return resolved;
  }

  async call(input: string): Promise<ToolResult> {
    let parsed: {
      action?: string;
      path?: string;
      content?: string;
      oldContent?: string;
      newContent?: string;
      line?: number;
    };

    try {
      parsed = JSON.parse(input);
    } catch {
      return {
        output: 'Error: input must be valid JSON. Example: {"action": "read", "path": "src/index.ts"}',
        error: "Invalid JSON input"
      };
    }

    const action = parsed.action ?? "read";
    const filePath = parsed.path;

    if (!filePath) {
      return { output: 'Error: "path" is required', error: "Missing path" };
    }

    let resolvedPath: string;
    try {
      resolvedPath = this.resolvePath(filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: `Security error: ${message}`, error: message };
    }

    try {
      switch (action) {
        case "read": {
          const content = await readFile(resolvedPath, "utf8");
          const lines = content.split("\n");
          const preview = lines
            .slice(0, 100)
            .map((line, i) => `${String(i + 1).padStart(4, " ")} | ${line}`)
            .join("\n");
          return {
            output: `File: ${filePath}\nLines: ${lines.length}\n\n${preview}${lines.length > 100 ? "\n... (truncated)" : ""}`,
            metadata: { path: resolvedPath, lines: lines.length }
          };
        }

        case "write": {
          const content = parsed.content ?? "";
          await mkdir(dirname(resolvedPath), { recursive: true });
          await writeFile(resolvedPath, content, "utf8");
          return {
            output: `File written: ${filePath} (${content.length} characters)`,
            metadata: { path: resolvedPath, size: content.length }
          };
        }

        case "append": {
          const content = parsed.content ?? "";
          await mkdir(dirname(resolvedPath), { recursive: true });
          const existing = await readFile(resolvedPath, "utf8").catch(() => "");
          await writeFile(resolvedPath, existing + content, "utf8");
          return {
            output: `Appended ${content.length} characters to: ${filePath}`,
            metadata: { path: resolvedPath }
          };
        }

        case "patch": {
          const oldContent = parsed.oldContent;
          const newContent = parsed.newContent ?? "";
          if (!oldContent) {
            return { output: 'Error: "oldContent" is required for patch action', error: "Missing oldContent" };
          }
          const fileContent = await readFile(resolvedPath, "utf8");
          if (!fileContent.includes(oldContent)) {
            return {
              output: `Error: oldContent not found in ${filePath}`,
              error: "Content not found"
            };
          }
          const updated = fileContent.replace(oldContent, newContent);
          await writeFile(resolvedPath, updated, "utf8");
          return {
            output: `Patched file: ${filePath}`,
            metadata: { path: resolvedPath }
          };
        }

        case "open": {
          if (!this.openInEditor) {
            return {
              output: `EditorTool is configured with openInEditor=false. File at: ${resolvedPath}`,
              metadata: { path: resolvedPath }
            };
          }
          const args: string[] = [resolvedPath];
          if (parsed.line) {
            if (this.editor.includes("code")) {
              args.unshift("--goto");
              args[1] = `${resolvedPath}:${parsed.line}`;
            }
          }
          await execFileAsync(this.editor, args);
          return {
            output: `Opened ${filePath} in ${this.editor}`,
            metadata: { path: resolvedPath, editor: this.editor }
          };
        }

        default:
          return {
            output: `Unknown action: "${action}". Supported: read, write, append, patch, open`,
            error: "Unknown action"
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: `Editor operation failed: ${message}`, error: message };
    }
  }
}
