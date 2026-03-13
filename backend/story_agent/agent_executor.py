"""Story Agent Executor — bridges the A2A protocol with Google ADK."""

import json
import logging
import re
import uuid

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import (
    DataPart,
    Message,
    Part,
    TaskState,
    TaskStatus,
    TaskStatusUpdateEvent,
    TextPart,
)
from a2a.utils import new_agent_text_message
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

from .agent import root_agent

logger = logging.getLogger(__name__)

APP_NAME = "interactive_story"


class StoryAgentExecutor(AgentExecutor):
    """Executes the interactive story ADK agent over the A2A protocol."""

    def __init__(self) -> None:
        self._session_service = InMemorySessionService()
        self._artifact_service = InMemoryArtifactService()
        self._memory_service = InMemoryMemoryService()
        self._runner = Runner(
            app_name=APP_NAME,
            agent=root_agent,
            artifact_service=self._artifact_service,
            session_service=self._session_service,
            memory_service=self._memory_service,
        )

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        """Process an incoming A2A request and stream back the story response."""
        task_id = context.task_id or str(uuid.uuid4())
        context_id = context.context_id or str(uuid.uuid4())

        try:
            user_message = self._extract_message(context)

            await event_queue.enqueue_event(
                TaskStatusUpdateEvent(
                    task_id=task_id,
                    context_id=context_id,
                    status=TaskStatus(state=TaskState.working),
                    final=False,
                )
            )

            session = await self._get_or_create_session(context_id)

            response_text = await self._run_agent(
                session_id=session.id,
                user_id=context_id,
                message=user_message,
            )

            await self._send_response(response_text, task_id, context_id, event_queue)

        except Exception:
            logger.exception("Unhandled error in StoryAgentExecutor.execute")
            await event_queue.enqueue_event(
                TaskStatusUpdateEvent(
                    task_id=task_id,
                    context_id=context_id,
                    status=TaskStatus(
                        state=TaskState.failed,
                        message=new_agent_text_message(
                            "The story encountered an unexpected error. Please try again."
                        ),
                    ),
                    final=True,
                )
            )

    # ── Message extraction ─────────────────────────────────────────────────────

    def _extract_message(self, context: RequestContext) -> str:
        """Extract the user's intent from the A2A request message.

        Handles plain text messages and A2UI action events (button clicks).
        """
        if not context.message or not context.message.parts:
            return "Start a new interactive story"

        for part in context.message.parts:
            root = part.root

            # A2UI action event (e.g., choice button click)
            if isinstance(root, DataPart):
                data = root.data
                if isinstance(data, dict):
                    action = data.get("action", {})
                    name = action.get("name", "")
                    action_data = action.get("data", {})

                    if name == "make_choice":
                        choice_text = action_data.get("choiceText", "an unknown choice")
                        return f"User chose: {choice_text}"

                    if name == "new_story":
                        genre = action_data.get("genre", "")
                        return f"Start a new {genre} story" if genre else "Start a new story"

            # Plain text message
            if isinstance(root, TextPart) and root.text:
                return root.text

        return "Continue the story"

    # ── Session management ─────────────────────────────────────────────────────

    async def _get_or_create_session(self, session_id: str):
        """Return an existing ADK session or create a fresh one."""
        try:
            session = await self._session_service.get_session(
                app_name=APP_NAME,
                user_id=session_id,
                session_id=session_id,
            )
            if session:
                return session
        except Exception:
            pass

        return await self._session_service.create_session(
            app_name=APP_NAME,
            user_id=session_id,
            session_id=session_id,
        )

    # ── ADK agent execution ────────────────────────────────────────────────────

    async def _run_agent(
        self,
        session_id: str,
        user_id: str,
        message: str,
    ) -> str:
        """Run the ADK agent and collect the full text response."""
        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=message)],
        )

        parts: list[str] = []
        async for event in self._runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.is_final_response() and event.content:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        parts.append(part.text)

        return "".join(parts)

    # ── Response handling ──────────────────────────────────────────────────────

    async def _send_response(
        self,
        response_text: str,
        task_id: str,
        context_id: str,
        event_queue: EventQueue,
    ) -> None:
        """Parse the agent response and enqueue the final A2A status event.

        The agent message (with A2UI data) is attached to the TaskStatusUpdateEvent
        so clients find everything in result.status.message.parts.
        """
        message_parts = self._build_message_parts(response_text)

        agent_message = Message(
            role="agent",
            parts=message_parts,
            message_id=str(uuid.uuid4()),
        )

        # Attach the full agent message to the input_required status event.
        # The frontend finds A2UI data in result.status.message.parts.
        await event_queue.enqueue_event(
            TaskStatusUpdateEvent(
                task_id=task_id,
                context_id=context_id,
                status=TaskStatus(
                    state=TaskState.input_required,
                    message=agent_message,
                ),
                final=False,
            )
        )

    def _build_message_parts(self, response_text: str) -> list[Part]:
        """Parse the agent response (JSON array) into A2A message parts.

        The agent is configured with response_mime_type="application/json" so
        the entire response should be a JSON array of A2UI messages.
        """
        raw = response_text.strip()

        # Strip accidental markdown fences (defensive)
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        try:
            a2ui_messages = json.loads(raw)
            if not isinstance(a2ui_messages, list):
                raise ValueError("Expected a JSON array")
            return [
                Part(
                    root=DataPart(
                        data={"a2uiMessages": a2ui_messages},
                        metadata={"mimeType": "application/x-a2ui-messages+json"},
                    )
                )
            ]
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Failed to parse A2UI JSON (%s) — raw: %s", exc, raw[:300])
            return [Part(root=TextPart(text=response_text))]

    async def cancel(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        raise NotImplementedError("Cancellation is not supported")
