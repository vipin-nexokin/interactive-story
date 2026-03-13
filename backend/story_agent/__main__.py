"""Entry point — starts the Story Agent A2A server."""

import logging
import os

import uvicorn
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
)
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware

from .agent_executor import StoryAgentExecutor

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# Cloud Run injects PORT; fall back to STORY_AGENT_PORT, then 8080
HOST = os.getenv("STORY_AGENT_HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", os.getenv("STORY_AGENT_PORT", "8080")))


def build_agent_card() -> AgentCard:
    return AgentCard(
        name="Interactive Story Agent",
        description=(
            "An immersive AI-powered interactive story narrator. "
            "Choose your genre, make choices, and shape your unique story."
        ),
        url=f"http://{HOST}:{PORT}/",
        version="1.0.0",
        default_input_modes=["text", "data"],
        default_output_modes=["text", "data"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[
            AgentSkill(
                id="interactive_story",
                name="Interactive Story Narration",
                description=(
                    "Creates branching narrative adventures across multiple genres. "
                    "Player choices determine the story outcome."
                ),
                tags=["story", "interactive", "narrative", "adventure", "game"],
                examples=[
                    "Start a fantasy adventure story",
                    "I want a mystery thriller",
                    "Begin a horror story",
                    "Science fiction — explore a distant planet",
                ],
            )
        ],
    )


def main() -> None:
    agent_card = build_agent_card()

    request_handler = DefaultRequestHandler(
        agent_executor=StoryAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )

    app = A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=request_handler,
    ).build()

    # CORS: allow localhost dev + any Cloud Run frontend (set CORS_ORIGIN to restrict)
    cors_origins_env = os.getenv("CORS_ORIGINS", "")
    cors_origins = (
        [o.strip() for o in cors_origins_env.split(",") if o.strip()]
        if cors_origins_env
        else ["*"]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("  Interactive Story Agent")
    logger.info(f"  Server  : http://{HOST}:{PORT}")
    logger.info(f"  Card    : http://{HOST}:{PORT}/.well-known/agent.json")
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    uvicorn.run(app, host=HOST, port=PORT)


if __name__ == "__main__":
    main()
