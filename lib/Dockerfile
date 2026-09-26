FROM node:20-bookworm-slim

WORKDIR /root/jam-md

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libvips-dev libwebp-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "run", "start:optimized"]
