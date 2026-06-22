FROM node:20-alpine

WORKDIR /app

# Eerst alleen de package-bestanden voor betere build-cache
COPY package*.json ./
RUN npm install --omit=dev

# Daarna de rest van de app
COPY . .

# Data komt in een volume zodat het bewaard blijft
ENV DATA_DIR=/data
ENV PORT=3000
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server.js"]
