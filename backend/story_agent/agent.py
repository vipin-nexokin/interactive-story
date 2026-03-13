"""Interactive Story Agent — built with Google ADK."""

from google.adk.agents import Agent
from google.genai import types as genai_types
from .prompts import STORY_SYSTEM_INSTRUCTION

root_agent = Agent(
    model="gemini-2.5-flash",
    name="interactive_story_agent",
    description=(
        "An immersive interactive story narrator that creates branching narrative adventures. "
        "Players make meaningful choices that shape the story outcome. "
        "Supports fantasy, mystery, sci-fi, horror, romance, and historical fiction genres."
    ),
    instruction=STORY_SYSTEM_INSTRUCTION,
    generate_content_config=genai_types.GenerateContentConfig(
        response_mime_type="application/json",
    ),
)
