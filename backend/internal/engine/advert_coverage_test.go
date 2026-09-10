package engine

import (
	"encoding/binary"
	"encoding/json"
	"testing"
	"time"

	"github.com/n30nex/cartolite/backend/internal/meshcore"
	"github.com/n30nex/cartolite/backend/internal/mqtt"
)

func TestPositionedAdvertAppearsWithoutAResolvedRoute(t *testing.T) {
	for _, withRF := range []bool{false, true} {
		state := newTestEngine(t)
		now := time.Now()
		payload := make([]byte, 109)
		for i := range payload[:32] {
			payload[i] = 0x2a
		}
		payload[100] = 0x92 // Repeater, coordinates, name; synthetic identity and signature.
		lat, lng := int32(45_300_000), int32(-79_200_000)
		binary.LittleEndian.PutUint32(payload[101:105], uint32(lat))
		binary.LittleEndian.PutUint32(payload[105:109], uint32(lng))
		payload = append(payload, []byte("Synthetic Muskoka")...)
		message := mqtt.Message{
			Topic:   mqtt.Topic{Region: "YQA", PublisherKey: "CC112233", Kind: "packets"},
			HeardAt: now.UnixMilli(),
			RawHex:  packetHexPayload(meshcore.PayloadAdvert, 1, []byte{0xdd}, payload...),
		}
		if withRF {
			rssi := -80.0
			message.RSSI = &rssi
		}
		if !state.process(message) {
			t.Fatal("a positioned advert did not update topology")
		}
		state.updateSnapshot(now)
		var public StateV2
		if err := json.Unmarshal(state.StateJSON(), &public); err != nil {
			t.Fatal(err)
		}
		if len(public.Nodes) != 1 || public.Nodes[0].Label != "Synthetic Muskoka" || public.Nodes[0].Lat != 45.3 || public.Nodes[0].Lng != -79.2 {
			t.Fatal("advert node missing from public state")
		}
		if len(public.Routes) != 0 {
			t.Fatal("unresolved advert path created a route")
		}
	}
}
