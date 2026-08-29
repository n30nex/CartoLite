#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
install -d -m 0755 /usr/local/lib/cartolite
install -m 0755 "$root/deploy/watchdog/cartolite_watchdog.py" /usr/local/lib/cartolite/cartolite_watchdog.py
install -m 0755 "$root/deploy/backup/cartolite_backup.py" /usr/local/lib/cartolite/cartolite_backup.py
install -m 0644 "$root/deploy/watchdog/cartolite-watchdog.service" /etc/systemd/system/cartolite-watchdog.service
install -m 0644 "$root/deploy/watchdog/cartolite-watchdog.timer" /etc/systemd/system/cartolite-watchdog.timer
install -m 0644 "$root/deploy/backup/cartolite-backup@.service" /etc/systemd/system/cartolite-backup@.service
install -m 0644 "$root/deploy/backup/cartolite-backup-daily.timer" /etc/systemd/system/cartolite-backup-daily.timer
install -m 0644 "$root/deploy/backup/cartolite-backup-weekly.timer" /etc/systemd/system/cartolite-backup-weekly.timer
install -m 0644 "$root/deploy/backup/cartolite-backup-monthly.timer" /etc/systemd/system/cartolite-backup-monthly.timer
systemctl daemon-reload

echo "Installed CartoLite operations units without enabling them."
echo "Create root-only /etc/cartolite-watch.env, /etc/cartolite-backup.env, and /etc/cartolite-restic-password first."
