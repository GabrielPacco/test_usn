# Demos para la revisión (Kubernetes local o k3s en AWS)

Atajo: `alias k="kubectl -n usn"` (en local añade `--context docker-desktop`).

## 0. Estado general
```bash
k get pods -o wide        # 4 servicios con réplicas + MySQL + Redis
k get svc,hpa,pvc
```

## 1. Escalabilidad (HPA)
```bash
k get hpa -w                          # terminal 1
k apply -f k8s/pruebas/09-stress-cpu.yaml     # terminal 2: 4 min de logins (BCrypt = CPU)
k top pods -l app=backend
```
Esperado: CPU > 50 % → backend 3 → 6 pods en ~30 s. Al terminar, vuelve a 3 tras ~5 min.
Limpiar: `k delete -f k8s/pruebas/09-stress-cpu.yaml`

## 2. Tolerancia a fallos (autocuración)
```bash
k delete pod <pod-de-backend>         # se recrea solo; el Service deja de enviarle tráfico
k get pods -l app=backend -w
```

## 3. Persistencia (PVC)
```bash
k exec deploy/mysql-deployment -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" railway -e "select count(*) from posts"'
k delete pod -l app=mysql
k wait --for=condition=ready pod -l app=mysql --timeout=180s
# repetir el select: mismos datos
```

## 4. Rolling update sin caída
```bash
while true; do curl -s localhost/version; sleep 0.3; done     # terminal 1 (en AWS: http://<IP>/version)
k set image deployment/frontend-deployment frontend=ghcr.io/gabrielpacco/usn-frontend:v2
k rollout status deployment/frontend-deployment
k rollout undo deployment/frontend-deployment                 # volver a v1
```
Esperado: mezcla v1/v2 durante el cambio, 0 errores. En el navegador, la pestaña dice "UNIverse v2".

## 5. Chat con 2 réplicas (Redis)
```bash
cd pruebas && npm install && PAIRS=30 node test-chat.js       # esperado: 100 %
k logs -l app=socket --tail=5 --prefix                        # usuarios repartidos entre pods
```
Sin Redis solo llegaba ~45 % de los mensajes (cada pod tenía su propia lista de usuarios).

## Tras cambiar código
- **Normal:** `git push` a `main` → GitHub Actions publica las imágenes en ghcr.io → `k rollout restart deployment/<nombre>`
  (con `imagePullPolicy: IfNotPresent`, para forzar la descarga de un tag ya existente borra el pod o usa un tag nuevo).
- **Probar sin publicar (Docker Desktop):**
  ```bash
  docker build -t ghcr.io/gabrielpacco/usn-backend:v1 backend
  ./cargar-imagenes.sh usn-backend:v1
  k rollout restart deployment/backend-deployment
  ```
