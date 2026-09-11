FROM node:20-slim

# Install system utilities: aria2 for parallel acceleration, python3 for resolver, archive extraction tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    aria2 \
    python3 \
    p7zip-full \
    unrar-free \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORT=5000
ENV MEDIA_ROOT=/media
ENV APP_DIR=/app
ENV DATA_DIR=/app/data

EXPOSE 5000

CMD ["node", "server.js"]
