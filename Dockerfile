# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./
COPY tsconfig.json ./

# Instalar todas las dependencias (incluyendo devDependencies para compilar)
RUN npm ci

# Copiar código fuente
COPY src ./src

# Compilar TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production && npm cache clean --force

# Copiar archivos compilados desde el stage de build
COPY --from=builder /app/dist ./dist

# Crear directorio para logs
RUN mkdir -p /app/logs

# Exponer puerto si es necesario (ajusta según tu aplicación)
# EXPOSE 3000

# Comando para ejecutar la aplicación
CMD ["npm", "start"]

