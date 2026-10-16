FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Environment variables (overridden by Cloud Run at runtime)
ENV PORT=8080
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Start command
CMD ["npm", "start"]
