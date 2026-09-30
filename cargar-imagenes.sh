#!/usr/bin/env bash
# Solo para probar cambios SIN publicarlos: importa imágenes construidas localmente
# (docker build -t ghcr.io/gabrielpacco/usn-backend:v1 backend) al nodo kind de Docker Desktop.
# Normalmente no hace falta: k8s descarga las imágenes de ghcr.io.
# Uso: ./cargar-imagenes.sh usn-backend:v1 usn-frontend:v2 ...   (sin tag = :v1; sin args = todas en v1)
set -e
CTX=docker-desktop
NODE=desktop-control-plane
IMGS=${@:-usn-frontend:v1 usn-backend:v1 usn-socket:v1 usn-ai-service:v1}
for i in $IMGS; do
  [[ $i == *:* ]] || i="$i:v1"
  echo ">> ghcr.io/gabrielpacco/$i"
  docker save ghcr.io/gabrielpacco/$i | MSYS_NO_PATHCONV=1 kubectl --context $CTX debug node/$NODE -i --quiet \
    --profile=sysadmin --image=busybox:1.36 -- chroot /host ctr -n k8s.io images import --all-platforms -
done
kubectl --context $CTX get pods -o name | grep node-debugger | xargs -r kubectl --context $CTX delete --wait=false >/dev/null
