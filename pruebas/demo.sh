#!/bin/bash
# Demo completa en una sola terminal: todo queda en el historial de la ventana.
source ~/usn-demo.sh
k() { kubectl -n usn "$@"; }
paso() { echo; echo "================================================================"; echo " $(date +%H:%M:%S)  $1"; echo "================================================================"; }
cmd()  { echo "\$ $*"; eval "$@"; }

paso "1. Nodos del clúster"
cmd kubectl get nodes -o wide

paso "2. Pods de la aplicación y en qué nodo corre cada uno"
cmd k get pods -o wide

paso "3. Servicios, HPA y disco de MySQL"
cmd k get svc,hpa,pvc

paso "4. Base de datos: filas por tabla"
cmd conteo

paso "5. Base de datos: últimos mensajes guardados"
cmd q "'SELECT m.message_id, u.username AS remitente, m.text FROM message m JOIN users u ON u.id=m.sender_id ORDER BY m.message_id DESC LIMIT 5'"

paso "6. Prueba de estrés: se lanza la carga de CPU contra el backend"
cmd k apply -f ~/app/k8s/pruebas/09-stress-cpu.yaml

paso "7. HPA durante el estrés (una lectura cada 20 s)"
for i in $(seq 1 10); do
  echo "--- $(date +%H:%M:%S)"
  k get hpa backend-hpa --no-headers
  sleep 20
done

paso "8. Réplicas del backend tras el escalado"
cmd "k get pods -l app=backend -o wide"
cmd kubectl top nodes

paso "9. Fin de la carga"
cmd k delete job stress-cpu

paso "10. La base de datos sigue intacta tras el estrés"
cmd conteo

echo
echo "Demo terminada. Sube con la rueda del ratón para ver todo el historial."
