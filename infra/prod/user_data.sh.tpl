#!/usr/bin/env bash
set -euxo pipefail

# --- Node 22 (arm64) + tooling ---
dnf install -y nodejs22 nodejs22-npm tar gzip awscli || dnf install -y nodejs npm tar gzip
# AL2023 ships Node via dnf; if the versioned package name differs, fall back to the default.
ln -sf "$(command -v node)" /usr/local/bin/node || true

# --- app user + dirs ---
id kbot >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/kbot --shell /usr/sbin/nologin kbot
mkdir -p /opt/kbot/releases /opt/kbot/.cache/audio
chown -R kbot:kbot /opt/kbot

# --- deploy script (pulled artifact -> release dir -> render env -> swap symlink -> restart) ---
cat >/opt/kbot/deploy.sh <<'DEPLOY'
#!/usr/bin/env bash
set -euo pipefail
SHA="$1"
REGION="${region}"
BUCKET="${artifact_bucket}"
REL="/opt/kbot/releases/$SHA"

aws s3 cp "s3://$BUCKET/kbot-$SHA.tgz" "/tmp/kbot-$SHA.tgz" --region "$REGION"
mkdir -p "$REL"
tar -xzf "/tmp/kbot-$SHA.tgz" -C "$REL"
cd "$REL"
npm ci --omit=dev

# render /opt/kbot/.env from SSM Parameter Store (decrypted)
aws ssm get-parameters-by-path --path /kbot/prod --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text --region "$REGION" \
  | awk -F'\t' '{ n=$1; sub(".*/","",n); print n"="$2 }' > /opt/kbot/.env
chmod 600 /opt/kbot/.env
chown kbot:kbot /opt/kbot/.env

ln -sfn "$REL" /opt/kbot/current
chown -R kbot:kbot "$REL"

systemctl restart kbot

# keep only the last 5 releases
ls -dt /opt/kbot/releases/*/ | tail -n +6 | xargs -r rm -rf
DEPLOY
chmod +x /opt/kbot/deploy.sh

# --- systemd: main service ---
cat >/etc/systemd/system/kbot.service <<'UNIT'
[Unit]
Description=Dotoree Kbot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kbot
WorkingDirectory=/opt/kbot/current
ExecStart=/usr/bin/env node dist/main.js
EnvironmentFile=/opt/kbot/.env
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/kbot

[Install]
WantedBy=multi-user.target
UNIT

# --- systemd: health probe (deep /healthz) ---
cat >/etc/systemd/system/kbot-health.service <<'UNIT'
[Unit]
Description=Probe kbot /healthz and restart if unhealthy

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:3000/healthz
ExecStopPost=/bin/sh -c 'systemctl is-failed --quiet kbot-health.service && systemctl restart kbot.service'
UNIT

cat >/etc/systemd/system/kbot-health.timer <<'UNIT'
[Unit]
Description=Run kbot health probe every minute

[Timer]
OnBootSec=120s
OnUnitActiveSec=60s

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
# Enable on boot. kbot will crash-loop (Restart=always) until the first deploy
# delivers code + /opt/kbot/.env; that is expected and harmless.
systemctl enable kbot.service kbot-health.timer
systemctl start kbot-health.timer || true
