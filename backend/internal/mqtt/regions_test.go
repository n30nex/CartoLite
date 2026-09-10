package mqtt

import (
	"strings"
	"testing"

	paho "github.com/eclipse/paho.mqtt.golang"
	"github.com/n30nex/cartolite/backend/internal/config"
)

type regionTestMessage struct {
	paho.Message
	topic string
	data  string
}

func (m regionTestMessage) Topic() string   { return m.topic }
func (m regionTestMessage) Payload() []byte { return []byte(m.data) }

func TestCanadaRegionAdmissionAndExplicitOverrides(t *testing.T) {
	// Labels only, from the 2026-09-10 coverage review; all messages are synthetic.
	observed := strings.Fields("XCM YBG YCD YEG YGK YHM YHU YHZ YJN YKA YKF YLK YML YOO YOW YPA YQA YQB YQL YQT YQY YSJ YSN YTA YTF YTR YUL YVE YVR YWG YXE YXU YXX YYB YYC YYJ YYY YYZ")
	for _, tc := range []struct {
		name, regions, legacy string
		allow                 string
	}{
		{name: "national defaults"},
		{name: "intentional restriction", regions: "yyz,YKF", allow: "YYZ YKF"},
		{name: "legacy restriction", legacy: "YQA", allow: "YQA"},
		{name: "explicit takes precedence", regions: "YYZ", legacy: "YQA", allow: "YYZ"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("REGION_ALLOWLIST", tc.regions)
			t.Setenv("PUBLIC_REGIONS", tc.legacy)
			cfg, err := config.Load("test", "synthetic")
			if err != nil {
				t.Fatal(err)
			}
			accepted := 0
			client := NewClient(ClientConfig{Regions: cfg.Regions}, nil, func(Message) bool {
				accepted++
				return true
			}, nil)
			denied := int64(0)
			for _, region := range append(observed, "SEA", "YQAX") {
				want := region != "SEA" && region != "YQAX"
				if tc.allow != "" {
					want = strings.Contains(" "+tc.allow+" ", " "+region+" ")
				}
				for _, kind := range []string{"packets", "status"} {
					data := `{"raw":"1100"}`
					if kind == "status" {
						data = `{"name":"Synthetic observer","lat":45.1,"lng":-79.2}`
					}
					before := accepted
					client.onMessage(nil, regionTestMessage{topic: "meshcore/" + region + "/AA112233/" + kind, data: data})
					if (accepted > before) != want {
						t.Errorf("%s %s admission = %v, want %v", region, kind, accepted > before, want)
					}
					if !want {
						denied++
					}
				}
			}
			if status := client.Status(); status.Malformed != 0 || status.DeniedRegions != denied {
				t.Fatalf("unexpected admission counters: %+v", status)
			}
		})
	}
}
