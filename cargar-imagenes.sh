#!/usr/bin/env bash
# Importa imágenes locales de Docker al nodo kind de Docker Desktop.
# Uso: ./cargar-imagenes.sh usn-backend:v1 usn-frontend:v2 ...   (sin tag = :v1; sin args = todas en v1)
set -e
CTX=docker-desktop
NODE=desktop-control-plane
IMGS=${@:-usn-frontend:v1 usn-backend:v1 usn-socket:v1 usn-ai-service:v1}
for i in $IMGS; do
  [[ $i == *:* ]] || i="$i:v1"
  echo ">> teriyaki08/$i"
  docker save teriyaki08/$i | MSYS_NO_PATHCONV=1 kubectl --context $CTX debug node/$NODE -i --quiet \
    --profile=sysadmin --image=busybox:1.36 -- chroot /host ctr -n k8s.io images import --all-platforms -
done
kubectl --context $CTX get pods -o name | grep node-debugger | xargs -r kubectl --context $CTX delete --wait=false >/dev/null
