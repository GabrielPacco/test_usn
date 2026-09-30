# Universe Social Network (USN) sobre Kubernetes en AWS

Red social universitaria con publicaciones, chat en tiempo real y moderación de contenido,
formada por 4 microservicios con réplicas y desplegada en un **clúster Kubernetes de 3 nodos
(kubeadm)** en AWS, con infraestructura como código (CloudFormation) e integración continua
(GitHub Actions + GitHub Container Registry).

> Despliegue en AWS paso a paso: [DEPLOYMENT_AWS.md](DEPLOYMENT_AWS.md)

## Arquitectura

```
Navegador ─► ALB :80 ─► NodePort 30080 (workers) ─► nginx (frontend)
                         ├─ /api       ─► backend (Spring Boot, 3-6 réplicas, HPA) ─► MySQL (StatefulSet + EBS)
                         ├─ /ai        ─► IA (FastAPI, 2 réplicas)
                         └─ /socket.io ─► socket (Socket.io, 2 réplicas)            ─► Redis
```

| Servicio | Tecnología | Réplicas | Puerto |
|---|---|---|---|
| Frontend | React 18 + nginx (proxy a `/api`, `/ai`, `/socket.io`) | 2 | 80 |
| Backend | Spring Boot 3, Java 17, JWT | 3-6 (HPA, CPU 50 %) | 5000 |
| Socket | Node.js + Socket.io + adaptador de Redis | 2 | 8800 |
| IA | FastAPI (moderación de texto) | 2 | 8000 |
| MySQL | MySQL 8, StatefulSet con disco EBS gp3 | 1 | 3306 |
| Redis | Bus de eventos del chat | 1 | 6379 |

## Estructura

```
.github/workflows/imagenes.yml   CI: construye y publica las imágenes en ghcr.io
aws/k8s-cluster-template.yaml    CloudFormation: VPC, 3 EC2 (kubeadm), ALB, IAM
k8s/                             Manifiestos (namespace, secrets, MySQL, servicios, HPA)
k8s/pruebas/09-stress-cpu.yaml   Job de carga para la prueba del HPA
pruebas/test-chat.js             Prueba del chat con varias réplicas
backend/  client/  socket/  ai-service/   Código de cada microservicio
docker-compose.yml + init.sql    Ejecución local para desarrollo
```

## Ejecución local (Docker Compose)

```bash
docker compose up --build
```
La app queda en http://localhost:3000. Las claves de Cloudinary (subida de fotos) son
opcionales: copiar `backend/.env.example` a `backend/.env`.

## Imágenes

En cada `push` a `main` que cambie el código, GitHub Actions publica:
`ghcr.io/gabrielpacco/usn-backend:v1`, `usn-socket:v1`, `usn-ai-service:v1`,
`usn-frontend:v1` y `usn-frontend:v2` (esta última para la demostración de *rolling update*).
