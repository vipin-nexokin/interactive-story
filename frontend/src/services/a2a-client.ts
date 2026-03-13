/**
 * a2a-client.ts
 *
 * Minimal A2A (Agent-to-Agent) protocol JSON-RPC client.
 * Communicates with the backend Story Agent.
 *
 * Protocol reference: https://a2aprotocol.ai
 */

import type { A2UIMessage } from "../components/a2ui-surface";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export interface A2AClientConfig {
  agentUrl: string;
  onStatusChange?: (status: ConnectionStatus) => void;
  onA2UIMessages?: (messages: A2UIMessage[]) => void;
  onNarratorText?: (text: string) => void;
  onError?: (message: string) => void;
  onLoading?: (loading: boolean) => void;
}

// ── Internal types matching A2A JSON-RPC spec ─────────────────────────────────

interface MessagePart {
  kind: "text" | "data" | "file";  // A2A wire format uses "kind"
  text?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

interface A2AMessagePayload {
  role: string;
  parts: MessagePart[];
  messageId: string;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: unknown;
}

// ── Counter for unique JSON-RPC request IDs ───────────────────────────────────

let _seq = 0;
const nextId = () => `req-${++_seq}-${Date.now()}`;

// ── Client ────────────────────────────────────────────────────────────────────

export class A2AClient {
  private config: A2AClientConfig;
  private contextId: string;
  private taskId: string | null = null;

  constructor(config: A2AClientConfig) {
    this.config = config;
    this.contextId = this._newContextId();
  }

  /** Reset to a fresh story session. */
  newStory(): void {
    this.contextId = this._newContextId();
    this.taskId = null;
  }

  /** Send a plain text message to the agent. */
  async sendText(text: string): Promise<void> {
    await this._send({
      role: "user",
      parts: [{ kind: "text", text }],
      messageId: nextId(),
    });
  }

  /** Send an A2UI action event (e.g., a choice button click). */
  async sendAction(actionName: string, actionData: Record<string, unknown>): Promise<void> {
    await this._send({
      role: "user",
      parts: [
        {
          kind: "data",
          data: { action: { name: actionName, data: actionData } },
          metadata: { mimeType: "application/json" },
        },
      ],
      messageId: nextId(),
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _newContextId(): string {
    return `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async _send(message: A2AMessagePayload): Promise<void> {
    const { onLoading, onStatusChange, onError } = this.config;

    onLoading?.(true);
    onStatusChange?.("connecting");

    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: nextId(),
      method: "message/send",
      params: {
        message,
        contextId: this.contextId,
        ...(this.taskId ? { taskId: this.taskId } : {}),
      },
    };

    try {
      const response = await fetch(this.config.agentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      onStatusChange?.("connected");
      this._handleRpcResponse(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[A2AClient] Request failed:", msg);
      onStatusChange?.("error");
      onError?.(`Could not reach the Story Agent: ${msg}`);
    } finally {
      onLoading?.(false);
    }
  }

  private _handleRpcResponse(data: unknown): void {
    if (!isObject(data)) return;

    // JSON-RPC error
    if ("error" in data && isObject(data.error)) {
      const msg = String((data.error as Record<string, unknown>).message ?? "Unknown agent error");
      this.config.onError?.(msg);
      return;
    }

    const result = isObject(data) && "result" in data ? data.result : null;
    if (!isObject(result)) return;

    // Track task ID for multi-turn conversation
    if (typeof result.id === "string") {
      this.taskId = result.id;
    }

    // Check for error state in status
    if (isObject(result.status)) {
      const state = result.status.state;
      if (state === "failed") {
        // Extract error message from status.message if present
        if (isObject(result.status.message)) {
          const errText = this._extractText(result.status.message);
          if (errText) this.config.onError?.(errText);
        }
        return;
      }

      // PRIMARY: A2UI data lives in result.status.message.parts
      if (isObject(result.status.message) && Array.isArray(result.status.message.parts)) {
        this._processParts(result.status.message.parts as MessagePart[]);
      }
    }

    // FALLBACK: check artifacts
    if (Array.isArray(result.artifacts)) {
      for (const artifact of result.artifacts) {
        if (isObject(artifact) && Array.isArray(artifact.parts)) {
          this._processParts(artifact.parts as MessagePart[]);
        }
      }
    }

    // FALLBACK: check task history for agent messages
    if (Array.isArray(result.history)) {
      for (const msg of result.history) {
        if (isObject(msg) && msg.role === "agent" && Array.isArray(msg.parts)) {
          this._processParts(msg.parts as MessagePart[]);
        }
      }
    }
  }

  private _extractText(message: Record<string, unknown>): string {
    if (!Array.isArray(message.parts)) return "";
    for (const part of message.parts as MessagePart[]) {
      if (part.kind === "text" && typeof part.text === "string") return part.text;
    }
    return "";
  }

  private _processParts(parts: MessagePart[]): void {
    for (const part of parts) {
      this._processPart(part);
    }
  }

  private _processPart(part: MessagePart): void {
    if (part.kind === "text" && typeof part.text === "string" && part.text.trim()) {
      this.config.onNarratorText?.(part.text.trim());
      return;
    }

    if (part.kind === "data" && isObject(part.data)) {
      const d = part.data as Record<string, unknown>;
      const mimeType = part.metadata?.["mimeType"] as string | undefined;

      // A2UI messages — check mime type in metadata (how a2a-sdk serializes it)
      // Also accept without mime type check as fallback
      if (Array.isArray(d.a2uiMessages)) {
        this.config.onA2UIMessages?.(d.a2uiMessages as A2UIMessage[]);
      }
      void mimeType; // used for future stricter checking
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
