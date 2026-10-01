# Atajos para la demo (cargado desde ~/.bashrc)
export PAGER=cat
alias k='kubectl -n usn'

# q 'SQL'  -> consulta a MySQL dentro del pod mysql-0
q() {
  kubectl -n usn exec mysql-0 -- sh -c \
    "mysql --default-character-set=utf8mb4 -uroot -p\"\$MYSQL_ROOT_PASSWORD\" railway -t -e \"$1\" 2>/dev/null"
}

# conteo  -> filas de las tablas principales
conteo() {
  q "SELECT 'users' tabla, COUNT(*) filas FROM users UNION ALL SELECT 'posts', COUNT(*) FROM posts UNION ALL SELECT 'chat', COUNT(*) FROM chat UNION ALL SELECT 'message', COUNT(*) FROM message"
}

# panel  -> tmux con 4 paneles: pods, HPA, base de datos y una consola libre
panel() {
  tmux kill-session -t demo 2>/dev/null
  tmux new-session -d -s demo -n demo
  tmux set -t demo mouse on
  tmux send-keys -t demo 'watch -n2 "kubectl -n usn get pods -o custom-columns=POD:.metadata.name,ESTADO:.status.phase,NODO:.spec.nodeName"' C-m
  tmux split-window -h -t demo
  tmux send-keys -t demo 'watch -n5 "kubectl -n usn get hpa; echo; kubectl top nodes"' C-m
  tmux split-window -v -t demo
  tmux send-keys -t demo 'source ~/usn-demo.sh; watch -n3 "bash -c \"source ~/usn-demo.sh; conteo\""' C-m
  tmux select-pane -t demo:0.0
  tmux split-window -v -t demo
  tmux send-keys -t demo 'source ~/usn-demo.sh; clear' C-m
  [ -z "$NOATTACH" ] && tmux attach -t demo
}
