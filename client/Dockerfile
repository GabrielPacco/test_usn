# Etapa 1: Construcción de la aplicación React
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# URLs relativas: el navegador llama al mismo host y nginx reenvía a cada servicio.
# Así la misma imagen funciona en local, en AWS o con cualquier IP.
ENV REACT_APP_API_URL=/api \
    REACT_APP_AI_URL=/ai \
    REACT_APP_SOCKET_URL=/ \
    REACT_APP_PUBLIC_FOLDER=/api/images/
RUN npm run build

# Etapa 2: nginx sirve el build y hace de proxy hacia los servicios internos
FROM nginx:1.27-alpine

# Versión de la imagen (para demostrar el rolling update): docker build --build-arg APP_VERSION=v2
ARG APP_VERSION=v1
ENV APP_VERSION=${APP_VERSION}

# Nombres de los servicios internos (por defecto, los Services de k8s)
ENV BACKEND_URL=http://backend-service:5000 \
    AI_URL=http://ai-service:8000 \
    SOCKET_URL=http://socket-service:8800

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
