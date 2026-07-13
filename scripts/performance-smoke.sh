#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:39476}"
broker_container="${2:-cartolite-mqtt}"
packet_count="${CARTOLITE_LOAD_PACKETS:-1200}"
client_count="${CARTOLITE_LOAD_CLIENTS:-8}"

pids=()
latency_events="$(mktemp)"
cleanup() {
  for pid in "${pids[@]:-}"; do kill "$pid" >/dev/null 2>&1 || true; done
  wait >/dev/null 2>&1 || true
  rm -f "$latency_events"
}
trap cleanup EXIT

# Bound the broker-to-public-stream delay before saturating the ingest path.
curl --silent --no-buffer --max-time 10 "$base_url/api/events" >"$latency_events" &
pids+=("$!")
for _ in $(seq 1 100); do
  grep -q '^event: hello' "$latency_events" && break
  sleep 0.02
done
grep -q '^event: hello' "$latency_events"
latency_started="$(date +%s%3N)"
docker exec "$broker_container" mosquitto_pub \
  --host 127.0.0.1 --port 1883 \
  --topic meshcore/YYZ/CC00000000000000000000000000000000000000000000000000000000000000/packets \
  --message '{"origin":"Synthetic Toronto Observer","raw":"0901AA00AA48656C6C6F","rssi":-72,"snr":7.4}'
for _ in $(seq 1 100); do
  grep -q '^event: packet' "$latency_events" && break
  sleep 0.02
done
grep -q '^event: packet' "$latency_events"
latency_ms=$(( $(date +%s%3N) - latency_started ))
echo "Broker-to-SSE packet latency: ${latency_ms} ms"
test "$latency_ms" -lt 750

for _ in $(seq 1 "$client_count"); do
  curl --silent --no-buffer --max-time 30 "$base_url/api/events" >/dev/null &
  pids+=("$!")
done
sleep 1

started="$(date +%s%N)"
awk -v count="$packet_count" 'BEGIN {
  for (i = 0; i < count; i++)
    print "{\"origin\":\"Synthetic Toronto Observer\",\"raw\":\"0901AA00AA48656C6C6F\",\"rssi\":-72,\"snr\":7.4}"
}' | docker exec --interactive "$broker_container" mosquitto_pub \
  --host 127.0.0.1 --port 1883 \
  --topic meshcore/YYZ/CC00000000000000000000000000000000000000000000000000000000000000/packets \
  --stdin-line
finished="$(date +%s%N)"

elapsed_ns=$((finished - started))
test "$elapsed_ns" -gt 0
rate=$((packet_count * 1000000000 / elapsed_ns))
echo "$packet_count packets published at ${rate}/s with $client_count SSE clients"
test "$rate" -ge 100

for _ in $(seq 1 20); do
  if curl --fail --silent "$base_url/readyz" | jq -e '.ready == true and .dropped == 0 and .queueDepth == 0' >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent "$base_url/readyz" | jq -e '.ready == true and .dropped == 0 and .queueDepth == 0' >/dev/null
curl --fail --silent "$base_url/api/state" | jq -e '.status.dropped == 0' >/dev/null

container_pid="$(docker inspect cartolite --format '{{.State.Pid}}')"
rss_kib="$(awk '/^VmRSS:/ {print $2}' "/proc/$container_pid/status")"
[[ "$rss_kib" =~ ^[0-9]+$ ]]
echo "CartoLite RSS after load: ${rss_kib} KiB"
test "$rss_kib" -lt 131072
