# Use Node.js LTS Alpine for minimal size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Expose default port (can be overridden via SERVER_PORT env var)
EXPOSE 4000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.SERVER_PORT || 4000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Run the server (reads from .env or environment variables)
CMD ["node", "dist/cli.js", "serve"]
