# Multi-stage Dockerfile para construir y ejecutar la app Miralo
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Instala dependencias de build
COPY package*.json ./
RUN npm ci

# Copia código fuente y compila TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:18-alpine
WORKDIR /usr/src/app

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --only=production

# Copia build desde el stage builder
COPY --from=builder /usr/src/app/dist ./dist


# Puerto interno usado por la app (coincide con PORT/WEBSITES_PORT)
ENV PORT=5000
ENV WEBSITES_PORT=5000
EXPOSE 5000

# Comando de arranque
CMD ["node", "dist/miralo.js"]

