# Despliegue en AWS: clúster Kubernetes (kubeadm) con CloudFormation

Universe Social Network sobre un clúster **Kubernetes oficial de 3 nodos instalado con
kubeadm** (1 control-plane + 2 workers), aprovisionado por completo con CloudFormation. Las
imágenes las construye GitHub Actions y se publican en `ghcr.io/gabrielpacco/usn-*`.

```
git push ─► GitHub Actions ─► ghcr.io (imágenes)
CloudFormation ─► VPC + 3 EC2 + ALB ─► kubeadm init/join ─► kubectl apply ─► pods en los workers

Navegador ─► ALB :80 ─► NodePort 30080 (workers) ─► nginx (frontend)
                         ├─ /api       ─► backend (Spring Boot, 3-6 réplicas, HPA) ─► MySQL (StatefulSet + EBS gp3)
                         ├─ /ai        ─► IA (FastAPI, 2 réplicas)
                         └─ /socket.io ─► socket (Socket.io, 2 réplicas)            ─► Redis
```

## Qué crea la plantilla (`aws/k8s-cluster-template.yaml`)

| Recurso | Detalle |
|---|---|
| Red | VPC `10.0.0.0/16`, 2 subredes públicas, Internet Gateway. Los nodos van en la misma zona para que el disco EBS de MySQL pueda conectarse a cualquier worker |
| Nodos | Ubuntu 22.04: `usn-control-plane` (`t3.medium`) y `usn-worker-1/2` (`t3.large`) |
| Kubernetes | containerd + `kubeadm`/`kubelet`/`kubectl` (v1.34, `pkgs.k8s.io`), red Flannel, metrics-server, driver EBS CSI |
| Entrada | Application Load Balancer público (:80) → NodePort 30080 de los workers, health check en `/version` |
| Seguridad | SG del ALB (solo 80); SG de nodos (SSH, 30080 solo desde el ALB, tráfico interno) |
| Permisos | Rol IAM de los nodos: `AmazonEBSCSIDriverPolicy` + lectura/escritura del parámetro SSM del `kubeadm join` |
| Señal | `WaitCondition`: el stack termina cuando la app responde |

## Crear el stack (~8 minutos)

CloudShell:
```bash
curl -sLO https://raw.githubusercontent.com/GabrielPacco/test_usn/main/aws/k8s-cluster-template.yaml
aws cloudformation create-stack --stack-name usn-k8s-cluster \
  --template-body file://k8s-cluster-template.yaml --capabilities CAPABILITY_IAM
aws cloudformation wait stack-create-complete --stack-name usn-k8s-cluster
aws cloudformation describe-stacks --stack-name usn-k8s-cluster \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
```

La app queda en la salida `AppURL`. Parámetros opcionales: `KeyName`, `SSHCidr`,
`WorkerInstanceType`, `RepoUrl`/`RepoBranch`, `CloudinaryCloudName`/`ApiKey`/`ApiSecret`.

## Usar kubectl

EC2 → `usn-control-plane` → Conectar → EC2 Instance Connect (usuario `ubuntu`):
```bash
alias k='kubectl -n usn'
kubectl get nodes -o wide
k get pods -o wide
k get svc,hpa,pvc
```
Log de instalación: `/var/log/usn-setup.log` (en cada nodo).

## Pruebas

| Prueba | Comandos clave |
|---|---|
| HPA | `k apply -f k8s/pruebas/09-stress-cpu.yaml` · `k get hpa -w` |
| Autocuración | `k delete pod <pod>` · `k get pods -w` |
| Persistencia | `k delete pod mysql-0` y comparar `select id,username from users` |
| Caída de un nodo | Detener un worker en EC2 · `kubectl get nodes -w` · `kubectl taint nodes <nodo> node.kubernetes.io/out-of-service=nodeshutdown:NoExecute` |
| Rolling update | `k set image deployment/frontend-deployment frontend=ghcr.io/gabrielpacco/usn-frontend:v2` |
| Chat | `cd pruebas && npm install && URL=http://<AppURL> PAIRS=30 node test-chat.js` |

## Eliminar

```bash
kubectl delete namespace usn                                   # en el control-plane: libera el disco EBS de MySQL
aws cloudformation delete-stack --stack-name usn-k8s-cluster   # en CloudShell
```
