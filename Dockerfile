FROM node:lts-alpine

COPY . /app
WORKDIR /app
RUN apk add --update-cache git \
 && rm -rf /var/cache/apk/* \
 && npm ci

ENV config=/config/
CMD ["npm", "run", "start"]
