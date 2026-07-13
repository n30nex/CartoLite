package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/n30nex/cartolite/backend/internal/meshcore"
	"github.com/n30nex/cartolite/backend/internal/mqtt"
)

func newTestEngine(t *testing.T) *Engine {
	t.Helper()
	state, err := New(Options{Checkpoint: filepath.Join(t.TempDir(), "state-v1.json"), QueueSize: 64, Version: "test", GitSHA: "abc"})
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func TestHighConfidenceRouteAndPublicPrivacy(t *testing.T) {
	state := newTestEngine(t)
	now := time.Now().UnixMilli()
	state.upsertNode("YKF", "AA112233", `<b>Alpha</b>`, "repeater", false, 43.40, -80.40, true, now)
	state.upsertNode("YKF", "BB112233", "Bravo", "room_server", false, 43.50, -80.50, true, now)
	state.upsertNode("YKF", "CC112233", "Observer", "unknown", true, 43.55, -80.55, true, now)
	rssi := -91.0
	message := mqtt.Message{
		Topic:       mqtt.Topic{Region: "YKF", PublisherKey: "CC112233", Kind: "packets"},
		ObserverKey: "CC112233", RSSI: &rssi, HeardAt: now,
		RawHex: packetHex(meshcore.PayloadControl, 1, 0xaa, 0xbb),
	}
	if !state.process(message) || len(state.routes) != 2 {
		t.Fatalf("expected two high-confidence route segments, got %d", len(state.routes))
	}
	state.updateSnapshot(time.Now())
	body := string(state.StateJSON())
	for _, forbidden := range []string{"AA112233", "BB112233", "CC112233", "<b>", "rawHex", "packetHash", "resolver"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("public state leaked %q: %s", forbidden, body)
		}
	}
	var public StateV1
	if err := json.Unmarshal([]byte(body), &public); err != nil {
		t.Fatal(err)
	}
	if len(public.Routes) != 2 || len(public.Nodes) != 3 {
		t.Fatalf("unexpected public topology: %#v", public)
	}
}

func TestResolverFailsClosed(t *testing.T) {
	state := newTestEngine(t)
	now := time.Now().UnixMilli()
	state.upsertNode("YKF", "AA112233", "A", "repeater", false, 43.4, -80.4, true, now)
	state.upsertNode("YKF", "AA998877", "collision", "repeater", false, 43.5, -80.5, true, now)
	state.upsertNode("YKF", "CC112233", "observer", "unknown", true, 43.6, -80.6, true, now)
	rssi := -80.0
	collision := mqtt.Message{Topic: mqtt.Topic{Region: "YKF", PublisherKey: "CC112233", Kind: "packets"}, ObserverKey: "CC112233", RSSI: &rssi, HeardAt: now, RawHex: packetHex(meshcore.PayloadControl, 1, 0xaa)}
	state.process(collision)
	if len(state.routes) != 0 {
		t.Fatal("prefix collision produced a public route")
	}
	state.process(mqtt.Message{Topic: collision.Topic, ObserverKey: collision.ObserverKey, HeardAt: now, RawHex: packetHex(meshcore.PayloadControl, 1, 0xaa)})
	if len(state.routes) != 0 {
		t.Fatal("packet without RF evidence produced a public route")
	}
	duplicate := collision
	duplicate.RawHex = packetHex(meshcore.PayloadControl, 1, 0xaa, 0xaa)
	state.process(duplicate)
	if len(state.routes) != 0 {
		t.Fatal("duplicate path prefix produced a public route")
	}
}

func TestResolverFiltersNonForwardersBeforeUniqueness(t *testing.T) {
	now := time.Now().UnixMilli()
	rssi := -80.0
	message := mqtt.Message{Topic: mqtt.Topic{Region: "YKF", PublisherKey: "CC112233", Kind: "packets"}, ObserverKey: "CC112233", RSSI: &rssi, HeardAt: now, RawHex: packetHex(meshcore.PayloadControl, 1, 0xaa)}

	oneForwarder := newTestEngine(t)
	oneForwarder.upsertNode("YKF", "AA112233", "relay", "repeater", false, 43.4, -80.4, true, now)
	oneForwarder.upsertNode("YKF", "AA998877", "client", "companion", false, 43.5, -80.5, true, now)
	oneForwarder.upsertNode("YKF", "CC112233", "observer", "unknown", true, 43.6, -80.6, true, now)
	oneForwarder.process(message)
	if len(oneForwarder.routes) != 1 {
		t.Fatalf("one eligible forwarder plus non-forwarder produced %d routes", len(oneForwarder.routes))
	}

	twoForwarders := newTestEngine(t)
	twoForwarders.upsertNode("YKF", "AA112233", "relay one", "repeater", false, 43.4, -80.4, true, now)
	twoForwarders.upsertNode("YKF", "AA998877", "relay two", "room_server", false, 43.5, -80.5, true, now)
	twoForwarders.upsertNode("YKF", "CC112233", "observer", "unknown", true, 43.6, -80.6, true, now)
	twoForwarders.process(message)
	if len(twoForwarders.routes) != 0 {
		t.Fatal("two eligible forwarders produced a public route")
	}
}

func TestNormalPacketUsesOnlyUniqueProtocolSourcePrefix(t *testing.T) {
	state := newTestEngine(t)
	now := time.Now().UnixMilli()
	source, _ := state.upsertNode("YKF", "DD112233", "source", "companion", false, 43.35, -80.35, true, now)
	hop, _ := state.upsertNode("YKF", "AA112233", "relay", "repeater", false, 43.4, -80.4, true, now)
	state.upsertNode("YKF", "CC112233", "observer", "unknown", true, 43.5, -80.5, true, now)
	rssi := -75.0
	message := mqtt.Message{
		Topic: mqtt.Topic{Region: "YKF", PublisherKey: "CC112233", Kind: "packets"}, ObserverKey: "CC112233",
		RSSI: &rssi, HeardAt: now, RawHex: packetHexPayload(meshcore.PayloadPlainText, 1, []byte{0xaa}, 0, 0xdd),
	}
	state.process(message)
	if len(state.routes) != 2 {
		t.Fatalf("unique source-to-hop path produced %d routes, want 2", len(state.routes))
	}
	if state.routes[routePublicID(nodePublicID(source), nodePublicID(hop))] == nil {
		t.Fatal("source-to-first-hop route was not recorded")
	}
}

func TestAmbiguousProtocolSourceIsOmittedWithoutDiscardingResolvedPath(t *testing.T) {
	state := newTestEngine(t)
	now := time.Now().UnixMilli()
	state.upsertNode("YKF", "DD112233", "source one", "companion", false, 43.35, -80.35, true, now)
	state.upsertNode("YKF", "DD998877", "source two", "companion", false, 43.36, -80.36, true, now)
	state.upsertNode("YKF", "AA112233", "relay", "repeater", false, 43.4, -80.4, true, now)
	state.upsertNode("YKF", "CC112233", "observer", "unknown", true, 43.5, -80.5, true, now)
	rssi := -75.0
	state.process(mqtt.Message{
		Topic: mqtt.Topic{Region: "YKF", PublisherKey: "CC112233", Kind: "packets"}, ObserverKey: "CC112233",
		RSSI: &rssi, HeardAt: now, RawHex: packetHexPayload(meshcore.PayloadPlainText, 1, []byte{0xaa}, 0, 0xdd),
	})
	if len(state.routes) != 1 {
		t.Fatalf("ambiguous optional source should leave only hop-to-observer route, got %d", len(state.routes))
	}
}

func TestDistanceGateAndTraceException(t *testing.T) {
	state := newTestEngine(t)
	now := time.Now().UnixMilli()
	state.upsertNode("YKF", "AA112233", "Ontario", "repeater", false, 43.4, -80.4, true, now)
	state.upsertNode("YKF", "BB112233", "BC", "repeater", false, 49.2, -123.1, true, now)
	rssi := -70.0
	base := mqtt.Message{Topic: mqtt.Topic{Region: "YKF", PublisherKey: "CC112233", Kind: "packets"}, RSSI: &rssi, HeardAt: now}
	base.RawHex = packetHex(meshcore.PayloadControl, 1, 0xaa, 0xbb)
	state.process(base)
	if len(state.routes) != 0 {
		t.Fatal("long unverified non-trace edge was accepted")
	}
	base.RawHex = packetHex(meshcore.PayloadTrace, 1, 0xaa, 0xbb)
	state.process(base)
	if len(state.routes) != 1 {
		t.Fatal("long trace edge with explicit trace evidence was rejected")
	}
}

func TestCheckpointRoundTripAndCorruptFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state-v1.json")
	state, err := New(Options{Checkpoint: path, QueueSize: 64})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	state.upsertNode("YKF", "AA112233", "Alpha", "repeater", false, 43.4, -80.4, true, now)
	if err := writeCheckpoint(path, state.nodes, state.routes); err != nil {
		t.Fatal(err)
	}
	restored, err := New(Options{Checkpoint: path, QueueSize: 64})
	if err != nil || len(restored.nodes) != 1 {
		t.Fatalf("checkpoint did not restore: %v", err)
	}
	if err := os.WriteFile(path, []byte("not-json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := New(Options{Checkpoint: path, QueueSize: 64}); err == nil {
		t.Fatal("corrupt checkpoint did not fail startup")
	}
}

func TestCheckpointPreflightRejectsUnusableParent(t *testing.T) {
	parent := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(parent, []byte("occupied"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := New(Options{Checkpoint: filepath.Join(parent, "state-v1.json"), QueueSize: 64}); err == nil {
		t.Fatal("startup accepted an unusable checkpoint directory")
	}
}

func TestCheckpointPreflightLeavesNoProbeFiles(t *testing.T) {
	dir := t.TempDir()
	if err := preflightCheckpoint(filepath.Join(dir, "state-v1.json")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("checkpoint preflight left artifacts: %#v", entries)
	}
}

func TestSanitizeLabel(t *testing.T) {
	got := sanitizeLabel(" <script>hello&goodbye</script> ", "repeater", false)
	if strings.ContainsAny(got, "<>&") || len([]rune(got)) > 18 {
		t.Fatalf("unsafe label: %q", got)
	}
	if got := sanitizeLabel("AABBCCDDEEFF001122", "repeater", false); got != "Repeater" {
		t.Fatalf("sensitive hex label was not replaced: %q", got)
	}
	for _, value := range []string{"0xAABBCC", "node AA:BB:CC", "node AA-BB-CC", "node AA BB CC", "prefix AABBCC"} {
		if got := sanitizeLabel(value, "repeater", false); got != "Repeater" {
			t.Fatalf("formatted key label %q sanitized to %q", value, got)
		}
	}
	if got := sanitizeLabel("Cafe Radio", "repeater", false); got != "Cafe Radio" {
		t.Fatalf("ordinary label was over-redacted: %q", got)
	}
}

func TestLastSeenOnlyNodeEventsAreCoalesced(t *testing.T) {
	state := newTestEngine(t)
	var events []Event
	state.SetPublisher(func(event Event) { events = append(events, event) })
	now := time.Now().UnixMilli()
	state.upsertNode("YKF", "CC112233", "observer", "unknown", true, 43.5, -80.5, true, now)
	events = nil

	base := mqtt.Message{Topic: mqtt.Topic{Region: "YKF", PublisherKey: "CC112233", Kind: "packets"}, ObserverKey: "CC112233"}
	base.HeardAt = now + 1_000
	state.observePublisher(base)
	if len(events) != 0 {
		t.Fatalf("last-seen-only update emitted %d immediate events", len(events))
	}
	base.HeardAt = now + 61_000
	state.observePublisher(base)
	if len(events) != 1 || events[0].Name != "node" {
		t.Fatalf("minute freshness update events = %#v", events)
	}
	events = nil
	base.HeardAt = now + 62_000
	base.ObserverName = "new observer label"
	state.observePublisher(base)
	if len(events) != 1 || events[0].Name != "node" {
		t.Fatalf("label topology update was not emitted immediately: %#v", events)
	}
}

func TestCoordinatesAreCanadaOnly(t *testing.T) {
	for _, point := range [][2]float64{{0, 0}, {40.9, -80}, {45, -51.9}, {49, -123}} {
		valid := validCoords(point[0], point[1])
		if point == [2]float64{49, -123} {
			if !valid {
				t.Fatal("valid Canadian coordinate rejected")
			}
		} else if valid {
			t.Fatalf("out-of-Canada coordinate accepted: %v", point)
		}
	}
}

func TestNodeIdentityIsStableAcrossRegions(t *testing.T) {
	state := newTestEngine(t)
	now := time.Now().UnixMilli()
	first, _ := state.upsertNode("YYZ", "AA112233", "Alpha", "repeater", false, 43.6, -79.4, true, now)
	second, _ := state.upsertNode("YKF", "AA112233", "Alpha", "repeater", false, 43.5, -80.5, true, now+1)
	if nodePublicID(first) != nodePublicID(second) {
		t.Fatal("same full key received different public IDs across regions")
	}
	state.updateSnapshot(time.Now())
	var public StateV1
	if err := json.Unmarshal(state.StateJSON(), &public); err != nil {
		t.Fatal(err)
	}
	if len(public.Nodes) != 1 || public.Nodes[0].Lng != -80.5 {
		t.Fatalf("cross-region node was not deduplicated to latest observation: %#v", public.Nodes)
	}
}

func packetHex(payloadType, hashSize int, prefixes ...byte) string {
	return packetHexPayload(payloadType, hashSize, prefixes)
}

func packetHexPayload(payloadType, hashSize int, prefixes []byte, payload ...byte) string {
	header := byte(payloadType<<2) | 1
	pathHeader := byte((hashSize-1)<<6) | byte(len(prefixes)/hashSize)
	raw := []byte{header, pathHeader}
	raw = append(raw, prefixes...)
	raw = append(raw, payload...)
	const digits = "0123456789ABCDEF"
	out := make([]byte, len(raw)*2)
	for index, value := range raw {
		out[index*2] = digits[value>>4]
		out[index*2+1] = digits[value&0x0f]
	}
	return string(out)
}
