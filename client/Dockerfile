# Multi-stage build for React app
FROM node:18 as build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Allow build-time env injection for Vite (optional)
ARG VITE_API_URL
ARG VITE_TIMER_WS_URL

RUN npm ci

# Copy source code
COPY . .

# Build the app
ENV VITE_API_URL=$VITE_API_URL \
	VITE_TIMER_WS_URL=$VITE_TIMER_WS_URL

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port (Railway will override this)
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]