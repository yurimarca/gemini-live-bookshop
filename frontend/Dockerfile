# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Bake in the WebSocket URL at build time
ARG VITE_WS_URL
ENV VITE_WS_URL=${VITE_WS_URL}

RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Cloud Run sets PORT (default 8080)
ENV PORT=8080

# nginx docker image auto-runs envsubst on /etc/nginx/templates/*.template
# and outputs to /etc/nginx/conf.d/, then starts nginx
EXPOSE ${PORT}
