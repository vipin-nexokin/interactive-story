# Interactive Story — ADK Agents + A2UI

An immersive AI-powered interactive story app where player choices drive the narrative.

- **Backend** — Google ADK agent (Gemini) exposed over the A2A protocol
- **Frontend** — Vite + Lit web app implementing the A2UI declarative UI protocol
- **Local PoC ready** — runs entirely on your machine; cloud deployment path documented below

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (port 5173)                       │
│                                                              │
│   ┌──────────────┐      A2UI JSON       ┌────────────────┐  │
│   │  story-app   │ ◄──────────────────► │  a2ui-surface  │  │
│   │  (Lit shell) │                      │  (renderer)    │  │
│   └──────┬───────┘                      └────────────────┘  │
│          │  A2A JSON-RPC (HTTP POST)                         │
└──────────┼──────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────┐
│                  Backend (port 8080)                         │
│                                                              │
│   ┌──────────────────┐     ┌───────────────────────────┐    │
│   │  A2A Starlette   │────►│   StoryAgentExecutor       │   │
│   │  server (a2a-sdk)│     │   (a2a.AgentExecutor)      │   │
│   └──────────────────┘     └────────────┬──────────────┘    │
│                                         │                    │
│                             ┌───────────▼──────────────┐    │
│                             │   Google ADK Runner       │   │
│                             │   └── root_agent          │   │
│                             │       (gemini-2.0-flash)  │   │
│                             └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Data flow

1. User selects a genre (or types a message) → **A2A JSON-RPC POST** to backend
2. `StoryAgentExecutor` extracts the intent (text message or choice action)
3. ADK `Runner` sends the message to the Gemini-powered `root_agent`
4. Agent responds with story narrative + **A2UI JSON** (separated by `---a2ui_JSON---`)
5. Executor parses and forwards the A2UI messages as `DataPart` in the A2A response
6. Frontend `A2AClient` receives the response and passes A2UI messages to `<a2ui-surface>`
7. `<a2ui-surface>` renders Text, Button, and Divider components
8. Player clicks a choice button → action event → back to step 1

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | ≥ 3.10 | https://www.python.org |
| uv | latest | https://docs.astral.sh/uv |
| Node.js | ≥ 18 | https://nodejs.org |
| npm | ≥ 9 | bundled with Node |
| Git | any | https://git-scm.com |

---

## Quick Start (Local PoC)

### 1. Setup (once)

```bash
cd interactive-story
bash setup.sh
```

This will:
- Create a Python virtual environment and install backend deps
- Install frontend npm packages
- Clone the A2UI reference library

### 2. Add your API key

Edit `backend/.env`:

```env
GOOGLE_API_KEY=your_api_key_here
GOOGLE_GENAI_USE_VERTEXAI=FALSE
```

Get a free key at https://aistudio.google.com/apikey

### 3. Start

```bash
bash start.sh
```

Opens http://localhost:5173 automatically.

---

## Manual Start (separate terminals)

**Terminal 1 — Backend:**
```bash
cd backend
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m story_agent
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

---

## Project Structure

```
interactive-story/
├── backend/
│   ├── story_agent/
│   │   ├── __init__.py          # Package init
│   │   ├── __main__.py          # A2A server entry point
│   │   ├── agent.py             # ADK root_agent definition
│   │   ├── agent_executor.py    # A2A ↔ ADK bridge
│   │   └── prompts.py           # System prompt + A2UI format guide
│   ├── .env.example
│   └── pyproject.toml
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── a2ui-surface.ts  # A2UI surface renderer (Lit web component)
│   │   ├── services/
│   │   │   └── a2a-client.ts    # A2A protocol client
│   │   ├── styles/
│   │   │   └── story.css        # Global theme (dark parchment)
│   │   └── app.ts               # Main story-app shell component
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── setup.sh                     # One-time setup script
├── start.sh                     # Start both services
└── README.md
```

---

## A2UI Implementation

This app implements the [A2UI protocol](https://a2ui.org) end-to-end:

**Agent side** — The ADK agent generates A2UI JSON messages in its responses, separated by the `---a2ui_JSON---` delimiter. Each response is a `surfaceUpdate` targeting the `"story"` surface with these component IDs:

| Component ID | Type | Purpose |
|---|---|---|
| `story-title` | Text (h1) | Story title (first turn only) |
| `story-scene` | Text (h2) | Current scene name |
| `story-narrative` | Text (body) | Story content |
| `story-divider` | Divider | Visual separator |
| `choice-heading` | Text (caption) | "What do you do?" |
| `choice-1..N` | Button | Player choices |

**Frontend side** — The `<a2ui-surface>` Lit web component:
- Receives `A2UIMessage[]` arrays via `processMessages()`
- Renders Text, Button, and Divider components
- Dispatches `a2ui-action` CustomEvents when buttons are clicked
- Uses CSS custom properties so global theme vars pierce shadow DOM

> **Note on the official A2UI Lit renderer:** The official `@a2ui/web-lib` npm package is not yet published (as of March 2026). This app includes a compatible custom renderer in `frontend/src/components/a2ui-surface.ts`. The A2UI reference repo is cloned to `a2ui-lib/` for reference; swap in the official library once published.

---

## Supported Story Genres

- 🗡️ Fantasy Adventure
- 🔍 Mystery Thriller
- 🚀 Science Fiction
- 👻 Horror
- 💘 Romance
- ⚔️ Historical Fiction

---

## Cloud Deployment (future)

### Backend → Google Cloud Run

```bash
# Build container
cd backend
gcloud builds submit --tag gcr.io/YOUR_PROJECT/story-agent

# Deploy
gcloud run deploy story-agent \
  --image gcr.io/YOUR_PROJECT/story-agent \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT
```

Update `backend/.env` for Vertex AI:
```env
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

### Backend → Vertex AI Agent Engine

ADK agents can be deployed directly to [Vertex AI Agent Engine](https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/overview) for managed scaling.

### Frontend → Firebase Hosting / Cloud Run

```bash
cd frontend
npm run build
# Deploy dist/ to Firebase Hosting or serve via Cloud Run
```

Update `frontend/.env`:
```env
VITE_AGENT_URL=https://your-story-agent-service-url/
```

---

## Troubleshooting

**Backend won't start — `ModuleNotFoundError`**
```bash
cd backend && uv pip install -e .
```

**`GOOGLE_API_KEY` errors**
- Verify the key is set in `backend/.env`
- Check the key is valid at https://aistudio.google.com

**CORS errors in browser**
- Ensure the backend is running on port 8080
- The backend uses Starlette with CORS middleware; check `STORY_AGENT_HOST` in `.env`

**A2UI JSON parse errors**
- Check backend logs for `Failed to parse A2UI JSON` — the LLM occasionally generates malformed JSON
- The app falls back to a plain text response in this case
- Retry usually resolves it

**Choices don't appear**
- Check browser DevTools → Network tab for errors on the `POST /` request
- Verify the response `DataPart` contains `a2uiMessages`

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `google-adk` | ADK agent framework (Python) |
| `a2a-sdk` | A2A protocol server + types (Python) |
| `uvicorn` | ASGI web server |
| `lit` | Web component framework (TypeScript) |
| `vite` | Frontend build tool |
