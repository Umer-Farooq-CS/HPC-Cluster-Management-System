# Stage 1: Build the React Application
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# Stage 2: Serve with a lightweight HTTP server
FROM nginx:alpine

# Copy the built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html
# Copy the custom Nginx configuration for React Router
COPY nginx.conf /etc/nginx/conf.d/default.conf

# We expose port 80, the main reverse proxy will route traffic here
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
