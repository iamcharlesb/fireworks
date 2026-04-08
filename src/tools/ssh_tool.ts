import { BaseTool, type BaseToolConfig } from "./base";
import type { ToolResult } from "../schema/types";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface SSHConnectionConfig {
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  timeout?: number;
}

export interface SSHToolConfig extends BaseToolConfig {
  connection?: SSHConnectionConfig;
  timeout?: number;
  maxOutputLength?: number;
}

/**
 * SSHTool — execute commands on remote servers via SSH.
 * Uses the system's `ssh` command-line client.
 *
 * Input format: "command" or "user@host command" or JSON:
 * {"host": "server.example.com", "command": "ls -la", "username": "ubuntu"}
 *
 * @example
 * const ssh = new SSHTool({
 *   connection: { host: "server.example.com", username: "ubuntu", privateKeyPath: "~/.ssh/id_rsa" }
 * })
 * const result = await ssh.run("ls -la /var/www")
 */
export class SSHTool extends BaseTool {
  name = "ssh";
  description =
    "Execute commands on remote servers via SSH. " +
    'Input can be a shell command string (uses configured connection) or JSON: ' +
    '{"host": "hostname", "username": "user", "command": "cmd", "privateKeyPath": "/path/key"}. ' +
    "Returns the command output (stdout and stderr).";

  private connection?: SSHConnectionConfig;
  private timeout: number;
  private maxOutputLength: number;

  constructor(config: SSHToolConfig = {}) {
    super(config);
    this.connection = config.connection;
    this.timeout = config.timeout ?? 30_000;
    this.maxOutputLength = config.maxOutputLength ?? 8_000;
  }

  /** Parse input: either JSON config or plain command string */
  private parseInput(input: string): { host: string; username: string; command: string; privateKeyPath?: string; port: number } | null {
    const trimmed = input.trim();

    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as {
          host?: string;
          username?: string;
          command?: string;
          privateKeyPath?: string;
          port?: number;
        };

        if (!parsed.host || !parsed.command) return null;

        return {
          host: parsed.host,
          username: parsed.username ?? this.connection?.username ?? "root",
          command: parsed.command,
          privateKeyPath: parsed.privateKeyPath ?? this.connection?.privateKeyPath,
          port: parsed.port ?? this.connection?.port ?? 22
        };
      } catch {
        return null;
      }
    }

    if (this.connection) {
      return {
        host: this.connection.host,
        username: this.connection.username,
        command: trimmed,
        privateKeyPath: this.connection.privateKeyPath,
        port: this.connection.port ?? 22
      };
    }

    return null;
  }

  async call(input: string): Promise<ToolResult> {
    const parsed = this.parseInput(input);

    if (!parsed) {
      return {
        output:
          "Error: could not parse SSH input. Provide a command string (with configured connection) " +
          'or JSON: {"host": "...", "username": "...", "command": "..."}',
        error: "Invalid input"
      };
    }

    const { host, username, command, privateKeyPath, port } = parsed;

    // Build SSH arguments
    const sshArgs: string[] = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "BatchMode=yes",
      "-o", `ConnectTimeout=${Math.floor(this.timeout / 1000)}`,
      "-p", String(port)
    ];

    if (privateKeyPath) {
      sshArgs.push("-i", privateKeyPath);
    }

    sshArgs.push(`${username}@${host}`, command);

    try {
      const { stdout, stderr } = await execFileAsync("ssh", sshArgs, {
        timeout: this.timeout,
        maxBuffer: this.maxOutputLength * 2
      });

      const output = [
        stdout ? `STDOUT:\n${stdout}` : "",
        stderr ? `STDERR:\n${stderr}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      const truncated =
        output.length > this.maxOutputLength
          ? output.slice(0, this.maxOutputLength) + "\n[Output truncated]"
          : output;

      return {
        output: truncated || "(no output)",
        metadata: { host, username, command }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        output: `SSH command failed: ${message}`,
        error: message,
        metadata: { host, username, command }
      };
    }
  }
}
