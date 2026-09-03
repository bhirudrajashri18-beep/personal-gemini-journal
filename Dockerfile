FROM node:20-slim

WORKDIR /app

# Copy package definitions
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install root & frontend dependencies cleanly
RUN npm install --omit=dev
RUN cd frontend && npm install

# Copy application source code
COPY . .

# Build Vite frontend assets
RUN cd frontend && npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "prod-server.js"]
