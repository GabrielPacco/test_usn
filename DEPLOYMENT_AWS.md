# Guia de Despliegue Automatizado en AWS y Kubernetes (IaC)

Este documento detalla como aprovisionar la infraestructura en AWS con CloudFormation y dejar la aplicacion completa corriendo sobre Kubernetes (k3s) **sin pasos manuales dentro de la instancia**: la plantilla instala k3s y aplica los manifiestos; las imagenes las construye GitHub Actions y k3s las descarga de `ghcr.io`.

---

## Tabla de Contenidos
1. [Requisitos Previos](#1-requisitos-previos)
2. [Arquitectura del despliegue](#2-arquitectura-del-despliegue)
3. [Paso 1: Crear el stack de CloudFormation](#paso-1-crear-el-stack-de-cloudformation)
4. [Paso 2: Verificacion del Estado de los Contenedores](#paso-2-verificacion-del-estado-de-los-contenedores)
5. [Paso 3: Protocolo de Demostracion para Evaluacion Docente](#paso-3-protocolo-de-demostracion-para-evaluacion-docente)
6. [Paso 4: Eliminacion de Recursos y Control de Costos](#paso-4-eliminacion-de-recursos-y-control-de-costos)
7. [Solucion de problemas](#solucion-de-problemas)

---

## 1. Requisitos Previos

- Cuenta de AWS (personal o Learner Lab) con permisos para EC2, Elastic IP y CloudFormation.
- **Opcional:** AWS CLI v2 configurado (`aws configure`) si se prefiere crear el stack por consola de comandos.
- **Opcional:** un par de claves EC2 para SSH (`vockey` en Learner Lab). Sin clave se puede entrar con **EC2 Instance Connect** desde la consola.

No hace falta Docker Hub ni compilar en la EC2: en cada `push` a `main`, el workflow `.github/workflows/imagenes.yml` construye las 4 imagenes y las publica en GitHub Container Registry (`ghcr.io/gabrielpacco/usn-*`). Los paquetes deben ser **publicos** (GitHub → Packages → paquete → Package settings → Change visibility) para que k3s pueda descargarlos sin credenciales.

```
git push ──► GitHub Actions (build) ──► ghcr.io/gabrielpacco/usn-*:v1 (y usn-frontend:v2)
CloudFormation ──► EC2 + k3s ──► git clone + kubectl apply ──► k3s descarga las imagenes
```

---

## 2. Arquitectura del despliegue

```
Navegador ──► http://<IP>:80 ──► frontend (nginx, 2 replicas)
                                   ├─ /          → build de React
                                   ├─ /api/*     → backend-service:5000   (Spring Boot, 3-6 replicas, HPA)
                                   ├─ /ai/*      → ai-service:8000        (FastAPI, 2 replicas)
                                   └─ /socket.io → socket-service:8800    (Socket.io, 2 replicas) ──► redis-service
                                                   backend ──► mysql-service:3306 (1 pod + PVC 5Gi)
```

- Solo el frontend es `LoadBalancer` (k3s lo publica en el puerto 80 de la EC2). El resto son `ClusterIP`: no son accesibles desde Internet.
- El Security Group abre unicamente **22 (SSH)** y **80 (HTTP)**.
- La **Elastic IP** mantiene la misma direccion aunque la instancia se detenga y se vuelva a iniciar.

---

## Paso 1: Crear el stack de CloudFormation

La plantilla `aws/ec2-k8s-template.yaml` crea:
- Security Group (22 y 80), instancia EC2 Ubuntu 22.04 (`t3.large` por defecto, disco gp3 de 20 GiB) y Elastic IP.
- Un script `UserData` que instala k3s, clona `RepoUrl`/`RepoBranch`, crea los Secrets (JWT aleatorio y, si se indican, las claves de Cloudinary) y ejecuta `kubectl apply -f k8s/`.
- Una `WaitCondition`: el stack solo queda en **CREATE_COMPLETE** cuando la app responde en el puerto 80 (unos **4-6 minutos**: arranque de la EC2, instalacion de k3s, descarga de imagenes y arranque de Spring Boot).

| Parametro | Por defecto | Descripcion |
|---|---|---|
| `InstanceType` | `t3.large` | `t3.medium` no alcanza para 6 backends (requests de 512Mi cada uno) |
| `KeyName` | vacio | Par de claves para SSH (`vockey` en Learner Lab) |
| `SSHCidr` | `0.0.0.0/0` | Recomendado: `TU_IP/32` |
| `RepoUrl` / `RepoBranch` | repo del grupo / `feature/import-application` | Codigo a desplegar |

### Metodo 1: Consola Web de CloudFormation

1. **CloudFormation → Crear pila → Con recursos nuevos (estandar)**.
2. *Cargar un archivo de plantilla* → `aws/ec2-k8s-template.yaml`.
3. Nombre de la pila: `usn-k8s-stack`. Revisar los parametros (en Learner Lab: `KeyName=vockey`).
4. **Enviar** y esperar a `CREATE_COMPLETE`.
5. En la pestana **Salidas** estan `AppURL`, `VersionURL`, `AIDocsURL`, `PublicIP` y `SSHCommand`.

### Metodo 2: AWS CLI

```powershell
aws cloudformation create-stack `
  --stack-name usn-k8s-stack `
  --template-body file://aws/ec2-k8s-template.yaml `
  --parameters ParameterKey=KeyName,ParameterValue=vockey `
  --region us-east-1

aws cloudformation wait stack-create-complete --stack-name usn-k8s-stack --region us-east-1

aws cloudformation describe-stacks --stack-name usn-k8s-stack --region us-east-1 `
  --query "Stacks[0].Outputs" --output table
```

---

## Paso 2: Verificacion del Estado de los Contenedores

Entrar a la instancia (`SSHCommand` de las salidas, o **EC2 → Conectar → EC2 Instance Connect**):

```bash
cat ~/k8s_ready.txt                 # "Universe Social Network listo."
k get pods -o wide                  # alias de: kubectl -n usn
k get svc,hpa,pvc
```

### URLs de acceso publico
- **Aplicacion web:** `http://<IP>`
- **Version del frontend:** `http://<IP>/version`
- **Documentacion de la IA:** `http://<IP>/ai/docs`

El backend y el socket no tienen URL publica propia: se accede a ellos a traves de `/api` y `/socket.io`.

---

## Paso 3: Protocolo de Demostracion para Evaluacion Docente

Los comandos se ejecutan dentro de la instancia, en `~/app`. `DEMO.md` tiene la version resumida.

### Prueba 1: Distribucion y Alta Disponibilidad de Replicas

```bash
k get pods -o wide
k get deploy
```

- 4 microservicios con replicas: backend (3), frontend (2), socket (2), IA (2).
- Servicios de soporte: MySQL (1 pod con volumen persistente) y Redis (bus de eventos del chat).

### Prueba 2: Tolerancia a Fallos y Autocuracion (Self-Healing)

```bash
k delete pod $(k get pods -l app=backend -o jsonpath='{.items[0].metadata.name}')
k get pods -l app=backend -w
```

- Las otras 2 replicas siguen atendiendo; el Service deja de enviar trafico al pod eliminado.
- El ReplicaSet crea un pod nuevo de inmediato para volver a 3 replicas.
- Las `readinessProbe` evitan que un pod reciba trafico antes de estar listo.

### Prueba 3: Persistencia de Datos

```bash
k exec deploy/mysql-deployment -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" railway -e "select count(*) from posts"'
k delete pod -l app=mysql
k wait --for=condition=ready pod -l app=mysql --timeout=180s
# repetir el select: mismos datos
```

- El pod nuevo monta el mismo `PersistentVolumeClaim` (`mysql-pvc`).
- En k3s el PVC usa la StorageClass `local-path` (disco de la propia EC2), **no EBS**. Los datos sobreviven al pod, pero no a la eliminacion de la instancia. Para volumenes EBS independientes del nodo haria falta EKS con el driver EBS CSI.

### Prueba 4: Carga y Autoescalado Horizontal (HPA)

```bash
k get hpa -w                                   # terminal 1
k apply -f k8s/pruebas/09-stress-cpu.yaml      # terminal 2
k top pods -l app=backend
```

- El job lanza 24 hilos haciendo login durante 4 minutos. Cada login verifica la contrasena con BCrypt, que consume CPU.
- Al superar el 50 % de CPU, el HPA escala el backend de 3 a 6 pods en ~30 s.
- Al terminar la carga, espera ~5 minutos (ventana de estabilizacion) y vuelve a 3.
- Limpiar: `k delete -f k8s/pruebas/09-stress-cpu.yaml`

### Prueba 5: Rolling Update sin caida

```bash
while true; do curl -s localhost/version; sleep 0.3; done      # terminal 1
k set image deployment/frontend-deployment frontend=ghcr.io/gabrielpacco/usn-frontend:v2
k rollout status deployment/frontend-deployment
k rollout undo deployment/frontend-deployment                  # volver a v1
```

- Durante el cambio conviven pods v1 y v2 (`maxSurge: 1`, `maxUnavailable: 0`), sin errores.
- En el navegador, el titulo de la pestana pasa a "UNIverse v2".

### Prueba 6: Moderacion con el Microservicio de IA

1. Publicar un texto hostil (ejemplo: *"eres un idiota"*): la interfaz muestra `Rechazado` y bloquea la publicacion.
2. Publicar un mensaje normal: se muestra `Aprobado` y el post se guarda.

---

## Paso 4: Eliminacion de Recursos y Control de Costos

```powershell
aws cloudformation delete-stack --stack-name usn-k8s-stack --region us-east-1
```

O en la consola: **CloudFormation → usn-k8s-stack → Eliminar**. Se eliminan la instancia, el disco, el Security Group y la Elastic IP.

> Una Elastic IP asociada a una instancia **detenida** o sin asociar genera cargo por hora. Si no se va a usar la app, eliminar el stack en lugar de solo detener la instancia.

---

## Solucion de problemas

| Sintoma | Revision |
|---|---|
| El stack termina en `CREATE_FAILED` por la `WaitCondition` | Entrar a la instancia y revisar `sudo tail -100 /var/log/usn-setup.log` |
| Pods en `Pending` | `k describe pod <pod>`: normalmente falta CPU/memoria (usar `t3.large`) |
| `502 Bad Gateway` tras borrar y recrear un Service | nginx guarda la IP del Service al arrancar: `k rollout restart deployment/frontend-deployment` |
| El chat no entrega mensajes | `k logs -l app=socket --tail=20`: debe aparecer `Redis adapter connected` |
