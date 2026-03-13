FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir hatchling && pip install --no-cache-dir .

# Copy source
COPY story_agent/ ./story_agent/

# Cloud Run sets PORT; default 8080
ENV STORY_AGENT_HOST=0.0.0.0

EXPOSE 8080

CMD ["python", "-m", "story_agent"]
