FROM node:18-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Backend URL injected at build time
ARG VITE_AGENT_URL=https://interactive-story-backend-893911842999.us-central1.run.app
# Write the backend URL into .env so Vite 2.x picks it up via import.meta.env
RUN echo "VITE_AGENT_URL=$VITE_AGENT_URL" > .env && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
