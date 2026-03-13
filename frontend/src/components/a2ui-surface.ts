/**
 * a2ui-surface.ts
 *
 * A2UI surface renderer — implements the A2UI declarative component protocol.
 * Renders Text, Button, and Divider components from A2UI surfaceUpdate messages.
 *
 * Compatible with the A2UI specification (https://a2ui.org).
 * When @a2ui/web-lib is published to npm, this can be swapped for the official renderer.
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

// ── A2UI Type Definitions ─────────────────────────────────────────────────────

export type TextValue = { literalString: string } | { path: string };

export type UsageHint =
  | "h1"
  | "h2"
  | "h3"
  | "body"
  | "caption"
  | "overline";

export interface A2UIText {
  text: TextValue;
  usageHint?: UsageHint;
}

export interface A2UIActionData {
  name: string;
  data?: Record<string, unknown>;
}

export interface A2UIButton {
  label: TextValue;
  action?: A2UIActionData;
  disabled?: boolean;
}

export type A2UIComponentDef =
  | { Text: A2UIText }
  | { Button: A2UIButton }
  | { Divider: Record<string, never> };

export interface A2UIComponentEntry {
  id: string;
  component: A2UIComponentDef;
}

export interface A2UISurfaceUpdate {
  surfaceId: string;
  components: A2UIComponentEntry[];
}

export interface A2UIMessage {
  surfaceUpdate?: A2UISurfaceUpdate;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function resolveText(value: TextValue, dataModel?: Record<string, unknown>): string {
  if ("literalString" in value) return value.literalString;
  if ("path" in value && dataModel) {
    const keys = value.path.replace(/^\//, "").split("/");
    let current: unknown = dataModel;
    for (const key of keys) {
      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[key];
      } else {
        return "";
      }
    }
    return String(current ?? "");
  }
  return "";
}

// ── A2UI Surface Web Component ────────────────────────────────────────────────

/**
 * `<a2ui-surface>` renders an A2UI surface identified by `surfaceId`.
 * Feed it A2UI messages via `processMessages(messages)`.
 * User action events bubble up as CustomEvent "a2ui-action".
 */
@customElement("a2ui-surface")
export class A2UISurface extends LitElement {
  @property({ type: String }) surfaceId = "";

  @state() private _components: A2UIComponentEntry[] = [];
  @state() private _dataModel: Record<string, unknown> = {};

  /**
   * Process an array of A2UI messages and update the surface if any
   * surfaceUpdate targets this surface's id.
   */
  processMessages(messages: A2UIMessage[]): void {
    for (const msg of messages) {
      if (msg.surfaceUpdate?.surfaceId === this.surfaceId) {
        this._components = msg.surfaceUpdate.components;
      }
    }
  }

  private _dispatchAction(name: string, data: Record<string, unknown> = {}) {
    this.dispatchEvent(
      new CustomEvent("a2ui-action", {
        detail: { action: { name, data } },
        bubbles: true,
        composed: true,
      })
    );
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  private _renderText(comp: A2UIText) {
    const text = resolveText(comp.text, this._dataModel);
    // Handle \n\n as paragraph breaks within body text
    if ((!comp.usageHint || comp.usageHint === "body") && text.includes("\n")) {
      const paragraphs = text.split(/\n\n+/);
      return html`<div class="story-body">
        ${paragraphs.map((p) => html`<p>${p}</p>`)}
      </div>`;
    }
    switch (comp.usageHint) {
      case "h1":
        return html`<h1 class="a2ui-h1">${text}</h1>`;
      case "h2":
        return html`<h2 class="a2ui-h2">${text}</h2>`;
      case "h3":
        return html`<h3 class="a2ui-h3">${text}</h3>`;
      case "caption":
        return html`<p class="a2ui-caption">${text}</p>`;
      case "overline":
        return html`<p class="a2ui-overline">${text}</p>`;
      default:
        return html`<p class="a2ui-body">${text}</p>`;
    }
  }

  private _renderButton(comp: A2UIButton) {
    const label = resolveText(comp.label, this._dataModel);
    return html`
      <button
        class="a2ui-choice-btn"
        ?disabled=${comp.disabled ?? false}
        @click=${() => {
          if (comp.action) {
            this._dispatchAction(comp.action.name, comp.action.data ?? {});
          }
        }}
      >
        ${label}
      </button>
    `;
  }

  private _renderComponent(entry: A2UIComponentEntry) {
    const def = entry.component;
    if ("Text" in def) return this._renderText(def.Text);
    if ("Button" in def) return this._renderButton(def.Button);
    if ("Divider" in def) return html`<hr class="a2ui-divider" />`;
    return nothing;
  }

  render() {
    if (this._components.length === 0) return nothing;
    return html`
      <div class="a2ui-surface" role="main" aria-label="Story surface">
        ${this._components.map((c) => this._renderComponent(c))}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    .a2ui-surface {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    /* CSS custom properties pierce shadow DOM, so we can use the global theme vars */

    .a2ui-h1 {
      font-family: var(--font-narrative, 'Crimson Pro', Georgia, serif);
      font-size: clamp(1.8rem, 5vw, 2.8rem);
      font-weight: 600;
      color: var(--color-accent, #c8973a);
      line-height: 1.2;
      margin-bottom: 0.25rem;
      letter-spacing: -0.01em;
    }

    .a2ui-h2 {
      font-family: var(--font-narrative, 'Crimson Pro', Georgia, serif);
      font-size: clamp(1rem, 3vw, 1.25rem);
      font-weight: 400;
      font-style: italic;
      color: var(--color-text-muted, #9e8f7a);
      margin-bottom: 1.5rem;
      letter-spacing: 0.04em;
    }

    .a2ui-h3 {
      font-family: var(--font-narrative, 'Crimson Pro', Georgia, serif);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text, #e8dcc8);
      margin-bottom: 0.75rem;
    }

    .a2ui-body,
    .story-body p {
      font-family: var(--font-narrative, 'Crimson Pro', Georgia, serif);
      font-size: clamp(1.05rem, 2.5vw, 1.2rem);
      line-height: 1.85;
      color: var(--color-text, #e8dcc8);
      margin-bottom: 1.1rem;
    }

    .story-body p:last-child { margin-bottom: 0; }

    .a2ui-caption {
      font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--color-text-muted, #9e8f7a);
      margin-bottom: 0.75rem;
    }

    .a2ui-overline {
      font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #9e8f7a);
    }

    .a2ui-divider {
      border: none;
      border-top: 1px solid var(--color-border, #3d3527);
      margin: 1.75rem 0 1.5rem;
      opacity: 0.6;
    }

    .a2ui-choice-btn {
      display: block;
      width: 100%;
      padding: 0.85rem 1.25rem;
      margin-bottom: 0.6rem;
      background: var(--color-surface-2, #2e2720);
      border: 1px solid var(--color-border, #3d3527);
      border-radius: var(--radius, 8px);
      color: var(--color-text, #e8dcc8);
      font-family: var(--font-narrative, 'Crimson Pro', Georgia, serif);
      font-size: 1.05rem;
      line-height: 1.4;
      text-align: left;
      cursor: pointer;
      transition: background 200ms ease, border-color 200ms ease, padding-left 200ms ease, transform 200ms ease;
      position: relative;
      overflow: hidden;
    }

    .a2ui-choice-btn::before {
      content: "›";
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--color-accent, #c8973a);
      font-size: 1.2rem;
      opacity: 0;
      transition: opacity 200ms ease;
    }

    .a2ui-choice-btn:hover:not(:disabled) {
      background: var(--color-accent-glow, rgba(200,151,58,0.15));
      border-color: var(--color-accent-dark, #a07830);
      padding-left: 2rem;
      transform: translateX(2px);
    }

    .a2ui-choice-btn:hover:not(:disabled)::before {
      opacity: 1;
    }

    .a2ui-choice-btn:active:not(:disabled) {
      transform: translateX(1px) scale(0.99);
    }

    .a2ui-choice-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .a2ui-choice-btn:focus-visible {
      outline: 2px solid var(--color-accent, #c8973a);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "a2ui-surface": A2UISurface;
  }
}
