#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/scada
QUADLET_DIR="$HOME/.config/containers/systemd"
RUNTIME_DIR="/run/user/$(id -u)"

export XDG_RUNTIME_DIR="$RUNTIME_DIR"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME_DIR/bus"

mkdir -p "$ROOT/env" "$QUADLET_DIR"
chmod 700 "$ROOT/env"

if [[ ! -f "$ROOT/env/postgres.env" || ! -f "$ROOT/env/api.env" ]]; then
  db_password="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  admin_token="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"

  cat > "$ROOT/env/postgres.env" <<EOF
POSTGRES_DB=scada
POSTGRES_USER=scada
POSTGRES_PASSWORD=$db_password
EOF

  cat > "$ROOT/env/api.env" <<EOF
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://scada:$db_password@scada-db:5432/scada
CORS_ORIGINS=https://yushun1990.github.io,http://localhost:5173,http://127.0.0.1:5173
SCADA_ADMIN_TOKEN=$admin_token
EOF

  chmod 600 "$ROOT/env/postgres.env" "$ROOT/env/api.env"
  echo "Created persistent SCADA runtime secrets in $ROOT/env"
fi

podman load -i "$ROOT/releases/scada-api.tar.gz"
cp "$ROOT/quadlet/"* "$QUADLET_DIR/"

systemctl --user daemon-reload
systemctl --user restart scada-db.service
systemctl --user restart scada-api.service

systemctl --user --no-pager --full status scada-db.service scada-api.service
