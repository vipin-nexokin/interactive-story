/**
 * app.ts — Interactive Story App
 *
 * Main Lit component: `<story-app>`.
 * Orchestrates the A2A client, A2UI surface renderer, and story UI.
 */

import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./components/a2ui-surface";
import type { A2UISurface, A2UIMessage, A2UIComponentEntry } from "./components/a2ui-surface";
import { A2AClient, type ConnectionStatus } from "./services/a2a-client";

const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://localhost:8080/";

interface HistoryEntry {
  components: A2UIComponentEntry[];
  choiceText: string; // what the user chose/typed for this turn
}

@customElement("story-app")
export class StoryApp extends LitElement {
  @state() private _status: ConnectionStatus = "idle";
  @state() private _loading = false;
  @state() private _hasStory = false;
  @state() private _narratorNote = "";
  @state() private _error = "";
  @state() private _storyHistory: HistoryEntry[] = [];

  private _client: A2AClient;
  private _currentComponents: A2UIComponentEntry[] = [];
  private _pendingChoiceText = "";

  constructor() {
    super();
    this._client = this._createClient();
  }

  private _createClient(): A2AClient {
    return new A2AClient({
      agentUrl: AGENT_URL,
      onStatusChange: (s) => {
        this._status = s;
      },
      onLoading: (l) => {
        this._loading = l;
        this._setButtonsDisabled(l);
      },
      onA2UIMessages: (msgs) => {
        this._ingestA2UIMessages(msgs);
        this._hasStory = true;
      },
      onNarratorText: (text) => {
        this._narratorNote = text;
      },
      onError: (msg) => {
        this._error = msg;
        this._loading = false;
      },
    });
  }

  private _ingestA2UIMessages(messages: A2UIMessage[]) {
    this._narratorNote = "";
    this._error = "";

    // Pull the incoming components out of the message
    let incomingComponents: A2UIComponentEntry[] = [];
    for (const msg of messages) {
      if (msg.surfaceUpdate?.surfaceId === "story") {
        incomingComponents = msg.surfaceUpdate.components;
      }
    }

    // Archive the previous turn (if any) with the choice the user made
    if (this._currentComponents.length > 0) {
      this._storyHistory = [
        ...this._storyHistory,
        { components: this._currentComponents, choiceText: this._pendingChoiceText },
      ];
    }

    this._currentComponents = incomingComponents;
    this._pendingChoiceText = "";

    // Forward to the live surface renderer
    const surface = this.renderRoot.querySelector<A2UISurface>("a2ui-surface");
    surface?.processMessages(messages);

    // Scroll to bottom so the new scene is visible
    this.updateComplete.then(() => {
      const el = this.renderRoot.querySelector(".story-content");
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }

  private _setButtonsDisabled(disabled: boolean) {
    this.updateComplete.then(() => {
      const surface = this.renderRoot.querySelector<A2UISurface>("a2ui-surface");
      const btns =
        surface?.renderRoot.querySelectorAll<HTMLButtonElement>(".a2ui-choice-btn") ?? [];
      btns.forEach((b) => (b.disabled = disabled));
    });
  }

  private _resetStory() {
    this._storyHistory = [];
    this._currentComponents = [];
    this._pendingChoiceText = "";
    this._hasStory = false;
    const surface = this.renderRoot.querySelector<A2UISurface>("a2ui-surface");
    surface?.processMessages([]);
  }

  private async _handleA2UIAction(e: CustomEvent) {
    const { action } = e.detail as { action: { name: string; data: Record<string, unknown> } };
    this._error = "";

    if (action.name === "make_choice") {
      this._pendingChoiceText = String(action.data.choiceText ?? "");
      await this._client.sendAction("make_choice", action.data);
    } else if (action.name === "new_story") {
      this._resetStory();
      this._client.newStory();
      await this._client.sendAction("new_story", action.data);
    }
  }

  private async _handleGenreSelect(e: Event) {
    const select = e.target as HTMLSelectElement;
    const genre = select.value;
    if (!genre) return;
    select.value = "";
    this._resetStory();
    this._client.newStory();
    await this._client.sendText(`Start a ${genre} story`);
  }

  private async _sendText(text: string) {
    if (!text || this._loading) return;
    this._pendingChoiceText = text;
    await this._client.sendText(text);
  }

  private async _handleCustomInput(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    const input = e.target as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await this._sendText(text);
  }

  private async _handleSendClick() {
    const input = this.renderRoot.querySelector<HTMLInputElement>(".story-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await this._sendText(text);
  }

  // ── History rendering ──────────────────────────────────────────────────────

  private _renderHistoryEntry(entry: HistoryEntry) {
    // Show narrative components only — skip buttons, dividers, choice headings
    const narrativeComps = entry.components.filter((c) => {
      const def = c.component;
      if ("Button" in def) return false;
      if ("Divider" in def) return false;
      if ("Text" in def && def.Text.usageHint === "caption") return false;
      return true;
    });

    return html`
      <div class="history-entry">
        ${narrativeComps.map((c) => this._renderHistoryComponent(c))}
        ${entry.choiceText
          ? html`<div class="history-choice">
              <span class="history-choice-arrow">›</span>
              <span class="history-choice-text">${entry.choiceText}</span>
            </div>`
          : nothing}
      </div>
      <hr class="history-divider" />
    `;
  }

  private _renderHistoryComponent(entry: A2UIComponentEntry) {
    const def = entry.component;
    if (!("Text" in def)) return nothing;
    const tv = def.Text.text;
    const text = "literalString" in tv ? tv.literalString : "";
    switch (def.Text.usageHint) {
      case "h1":
        return html`<h1 class="hist-h1">${text}</h1>`;
      case "h2":
        return html`<h2 class="hist-h2">${text}</h2>`;
      default: {
        const paras = text.split(/\n\n+/);
        return html`<div class="hist-body">${paras.map((p) => html`<p>${p}</p>`)}</div>`;
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    return html`
      <div class="app-shell">
        ${this._renderHeader()}
        <main class="story-content">
          ${this._hasStory
            ? html`
                ${this._storyHistory.map((e) => this._renderHistoryEntry(e))}
                ${this._narratorNote
                  ? html`<p class="narrator-note">${this._narratorNote}</p>`
                  : nothing}
                <a2ui-surface
                  surfaceId="story"
                  @a2ui-action=${this._handleA2UIAction}
                ></a2ui-surface>
              `
            : this._renderWelcome()}
          ${this._error
            ? html`<div class="error-banner" role="alert">
                ⚠ ${this._error}
                <button @click=${() => (this._error = "")}>✕</button>
              </div>`
            : nothing}
        </main>
        ${this._renderFooter()}
        ${this._loading ? html`<div class="loading-veil"><span class="quill"></span></div>` : nothing}
      </div>
    `;
  }

  private _renderHeader() {
    return html`
      <header class="app-header">
        <div class="header-left">
          <span class="logo">📖</span>
          <span class="app-title">Interactive Story</span>
          <span class="powered-by">powered by ADK + A2UI</span>
        </div>
        <nav class="header-actions">
          <select
            class="genre-select"
            title="Start a new story"
            @change=${this._handleGenreSelect}
            ?disabled=${this._loading}
          >
            <option value="">New Story…</option>
            <option value="fantasy adventure">🗡️ Fantasy Adventure</option>
            <option value="mystery thriller">🔍 Mystery Thriller</option>
            <option value="science fiction">🚀 Science Fiction</option>
            <option value="horror">👻 Horror</option>
            <option value="romance">💘 Romance</option>
            <option value="historical fiction">⚔️ Historical Fiction</option>
          </select>
        </nav>
      </header>
    `;
  }

  private _renderWelcome() {
    return html`
      <div class="welcome-screen">
        <div class="welcome-emblem">📖</div>
        <h1 class="welcome-title">Interactive Story</h1>
        <p class="welcome-subtitle">
          Choose your adventure. Every decision shapes the story.
        </p>
        <div class="welcome-genres">
          ${[
            ["🗡️", "Fantasy Adventure", "fantasy adventure"],
            ["🔍", "Mystery Thriller", "mystery thriller"],
            ["🚀", "Science Fiction", "science fiction"],
            ["👻", "Horror", "horror"],
            ["💘", "Romance", "romance"],
            ["⚔️", "Historical Fiction", "historical fiction"],
          ].map(
            ([icon, label, value]) => html`
              <button
                class="genre-card"
                ?disabled=${this._loading}
                @click=${() => {
                  this._resetStory();
                  this._client.newStory();
                  this._client.sendText(`Start a ${value} story`);
                }}
              >
                <span class="genre-icon">${icon}</span>
                <span class="genre-label">${label}</span>
              </button>
            `
          )}
        </div>
        <p class="welcome-hint">Or type your own idea below ↓</p>
      </div>
    `;
  }

  private _renderFooter() {
    return html`
      <footer class="app-footer">
        <input
          class="story-input"
          type="text"
          placeholder="Type your own choice or suggestion…"
          ?disabled=${this._loading}
          @keydown=${this._handleCustomInput}
        />
        <button
          class="send-btn"
          ?disabled=${this._loading}
          @click=${this._handleSendClick}
          title="Send (or press Enter)"
        >
          Send
        </button>
        <span class="status-dot status-${this._status}" title="Agent: ${this._status}"></span>
      </footer>
    `;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static styles = css`
    :host {
      display: contents;
    }

    /* ── Shell ─────────────────────────────────────────────────────────────── */
    .app-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      position: relative;
    }

    /* ── Header ────────────────────────────────────────────────────────────── */
    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1.5rem;
      background: rgba(26, 22, 16, 0.92);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .logo {
      font-size: 1.4rem;
      line-height: 1;
    }

    .app-title {
      font-family: var(--font-narrative);
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--color-accent);
      letter-spacing: -0.01em;
    }

    .powered-by {
      font-size: 0.7rem;
      color: var(--color-text-muted);
      font-family: var(--font-ui);
      letter-spacing: 0.03em;
    }

    .genre-select {
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      color: var(--color-text);
      font-family: var(--font-ui);
      font-size: 0.85rem;
      padding: 0.4rem 0.75rem;
      cursor: pointer;
      outline: none;
      transition: border-color var(--transition);
    }

    .genre-select:hover:not(:disabled) {
      border-color: var(--color-accent-dark);
    }

    .genre-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Story content ─────────────────────────────────────────────────────── */
    .story-content {
      flex: 1;
      overflow-y: auto;
      padding: 2.5rem 1.5rem 3rem;
      max-width: var(--max-width);
      width: 100%;
      margin: 0 auto;
    }

    .narrator-note {
      font-family: var(--font-ui);
      font-size: 0.8rem;
      color: var(--color-text-muted);
      font-style: italic;
      margin-bottom: 1rem;
      padding: 0.5rem 0.75rem;
      border-left: 2px solid var(--color-border);
    }

    /* ── Story history ─────────────────────────────────────────────────────── */
    .history-entry {
      opacity: 0.72;
    }

    .history-entry:hover {
      opacity: 0.88;
      transition: opacity 200ms ease;
    }

    .hist-h1 {
      font-family: var(--font-narrative);
      font-size: clamp(1.8rem, 5vw, 2.8rem);
      font-weight: 600;
      color: var(--color-accent);
      line-height: 1.2;
      margin-bottom: 0.25rem;
      letter-spacing: -0.01em;
    }

    .hist-h2 {
      font-family: var(--font-narrative);
      font-size: clamp(1rem, 3vw, 1.25rem);
      font-weight: 400;
      font-style: italic;
      color: var(--color-text-muted);
      margin-bottom: 1.5rem;
      letter-spacing: 0.04em;
    }

    .hist-body p {
      font-family: var(--font-narrative);
      font-size: clamp(1.05rem, 2.5vw, 1.2rem);
      line-height: 1.85;
      color: var(--color-text);
      margin-bottom: 1.1rem;
    }

    .hist-body p:last-child {
      margin-bottom: 0;
    }

    .history-choice {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin: 1.25rem 0 0.5rem;
      padding: 0.6rem 1rem;
      background: var(--color-accent-glow);
      border-left: 3px solid var(--color-accent-dark);
      border-radius: 0 var(--radius) var(--radius) 0;
    }

    .history-choice-arrow {
      color: var(--color-accent);
      font-size: 1.2rem;
      flex-shrink: 0;
    }

    .history-choice-text {
      font-family: var(--font-narrative);
      font-size: 1rem;
      font-style: italic;
      color: var(--color-text);
    }

    .history-divider {
      border: none;
      border-top: 1px solid var(--color-border);
      margin: 2rem 0;
      opacity: 0.4;
    }

    /* ── Welcome screen ────────────────────────────────────────────────────── */
    .welcome-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 4rem 1rem 2rem;
      gap: 1rem;
    }

    .welcome-emblem {
      font-size: 3.5rem;
      margin-bottom: 0.5rem;
      filter: drop-shadow(0 0 20px var(--color-accent-glow));
    }

    .welcome-title {
      font-family: var(--font-narrative);
      font-size: clamp(2rem, 6vw, 3rem);
      font-weight: 600;
      color: var(--color-accent);
      line-height: 1.1;
    }

    .welcome-subtitle {
      font-family: var(--font-narrative);
      font-size: 1.15rem;
      color: var(--color-text-muted);
      max-width: 420px;
    }

    .welcome-genres {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.75rem;
      width: 100%;
      max-width: 560px;
      margin-top: 1rem;
    }

    .genre-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      padding: 1rem 0.75rem;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: background var(--transition), border-color var(--transition),
        transform var(--transition);
      color: var(--color-text);
    }

    .genre-card:hover:not(:disabled) {
      background: var(--color-accent-glow);
      border-color: var(--color-accent-dark);
      transform: translateY(-2px);
    }

    .genre-card:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .genre-icon {
      font-size: 1.75rem;
      line-height: 1;
    }

    .genre-label {
      font-family: var(--font-ui);
      font-size: 0.8rem;
      font-weight: 500;
      text-align: center;
    }

    .welcome-hint {
      font-size: 0.8rem;
      color: var(--color-text-muted);
      margin-top: 0.5rem;
    }

    /* ── Footer ────────────────────────────────────────────────────────────── */
    .app-footer {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.85rem 1.5rem;
      background: rgba(26, 22, 16, 0.92);
      backdrop-filter: blur(8px);
      border-top: 1px solid var(--color-border);
      position: sticky;
      bottom: 0;
    }

    .story-input {
      flex: 1;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      color: var(--color-text);
      font-family: var(--font-ui);
      font-size: 0.9rem;
      padding: 0.55rem 0.85rem;
      outline: none;
      transition: border-color var(--transition);
    }

    .story-input::placeholder {
      color: var(--color-text-muted);
    }

    .story-input:focus {
      border-color: var(--color-accent-dark);
    }

    .story-input:disabled {
      opacity: 0.5;
    }

    .send-btn {
      background: var(--color-surface-2);
      border: 1px solid var(--color-accent-dark);
      border-radius: var(--radius);
      color: var(--color-accent);
      font-family: var(--font-ui);
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.55rem 1rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background var(--transition), border-color var(--transition);
    }

    .send-btn:hover:not(:disabled) {
      background: var(--color-accent-glow);
      border-color: var(--color-accent);
    }

    .send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* ── Status dot ────────────────────────────────────────────────────────── */
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background var(--transition);
    }

    .status-idle { background: var(--color-border); }
    .status-connecting { background: var(--color-accent); animation: pulse 1s infinite; }
    .status-connected { background: #5aad7a; }
    .status-error { background: var(--color-error); }

    /* ── Error banner ──────────────────────────────────────────────────────── */
    .error-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: rgba(208, 64, 64, 0.1);
      border: 1px solid rgba(208, 64, 64, 0.3);
      border-radius: var(--radius);
      color: #e08080;
      font-size: 0.85rem;
      margin-top: 1rem;
    }

    .error-banner button {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font-size: 1rem;
      padding: 0 0.25rem;
      opacity: 0.7;
    }

    .error-banner button:hover {
      opacity: 1;
    }

    /* ── Loading veil ──────────────────────────────────────────────────────── */
    .loading-veil {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(26, 22, 16, 0.4);
      backdrop-filter: blur(2px);
      z-index: 100;
      pointer-events: none;
    }

    .quill {
      display: inline-block;
      width: 40px;
      height: 40px;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* ── Animations ────────────────────────────────────────────────────────── */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── a2ui-surface host styles ───────────────────────────────────────────── */
    a2ui-surface {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "story-app": StoryApp;
  }
}
