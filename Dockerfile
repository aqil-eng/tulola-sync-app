FROM node:20-alpine
RUN apk add --no-cache openssl nginx

EXPOSE 80

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .
COPY nginx.conf /etc/nginx/nginx.conf

RUN npm run build

# Create start script
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'nginx -g "daemon on;"' >> /start.sh && \
    echo 'npm run docker-start' >> /start.sh && \
    chmod +x /start.sh

CMD ["/start.sh"]
