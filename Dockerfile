# Use an ARM64 compatible base image
FROM node:20-bullseye-slim

# Install dependencies for Puppeteer and other tools
RUN apt-get update && apt-get install -y \
  wget \
  gnupg \
  ca-certificates \
  procps \
  libxss1 \
  git \
  chromium \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Set up working directory
WORKDIR /app

# Copy pnpm-lock.yaml (if you have one)
COPY pnpm-lock.yaml ./

# Install dependencies
RUN pnpm fetch --prod

# Copy the rest of the application
COPY . .

# Install all dependencies (including devDependencies)
RUN pnpm install

# Set environment variable to use system-installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium

# Expose the port your dev server runs on
EXPOSE 8080

# Command to run the development server
CMD ["pnpm", "run", "dev"]