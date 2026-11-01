package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/n30nex/cartolite/backend/internal/scopes"
)

type scopeRoundTrip func(*http.Request) (*http.Response, error)

func (f scopeRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestProviderBoundaryAndDecodeSemantics(t *testing.T) {
	now := time.Now().UnixMilli()
	key := strings.Repeat("AA", 32)
	good := providerSource{URL: "https://ykf.meshmapper.net/get_scopes.php", Region: "YKF", Kind: "scopes"}
	if !validProviderSource(good) {
		t.Fatal("approved source rejected")
	}
	for _, url := range []string{"http://ykf.meshmapper.net/get_scopes.php", "https://meshmapper.net.evil.test/get_scopes.php", "https://ykf.meshmapper.net:8443/get_scopes.php", "https://user@ykf.meshmapper.net/get_scopes.php", "https://ykf.meshmapper.net/private.php", "https://ykf.meshmapper.net/get_scopes.php?key=secret"} {
		bad := good
		bad.URL = url
		if validProviderSource(bad) {
			t.Fatalf("unsafe destination accepted: %s", url)
		}
	}
	directory := []byte(`{"country":"CA","zones":[{"code":"YKF","country":"CA","url":"https://ykf.meshmapper.net/"}]}`)
	if sources, ok := decodeProviderDirectory(directory); !ok || len(sources) != 2 {
		t.Fatal("directory failed")
	}
	badDirectory := strings.ReplaceAll(string(directory), "https://ykf.meshmapper.net/", "https://evil.test/")
	if _, ok := decodeProviderDirectory([]byte(badDirectory)); ok {
		t.Fatal("directory escaped allowlist")
	}
	body := fmt.Sprintf(`[{"hex_id":%q,"iata":"YKF","scopes":[{"scope":"ykf","observed_pkts":99999,"observed_at":%d}]},{"hex_id":%q,"iata":"YKF","scopes":[],"scopes_checked_at":%d},{"hex_id":%q,"iata":"YKF","scopes":null,"scopes_checked_at":%d},{"hex_id":%q,"iata":"YKF","default_scope":"*","default_scope_state":"named","default_scope_src":"advert"}]`, key, now/1000, key, now/1000, key, now/1000, key)
	reports, ok := decodeProviderReports([]byte(body), now)
	if !ok || len(reports) != 2 || !reports[0].List || len(reports[0].Entries) != 0 || reports[1].DefaultSource != "advert" || reports[1].At != 0 {
		t.Fatalf("observed counters, null, empty or unknown default age conflated: %+v", reports)
	}
}

func TestProviderDoesNotFollowRedirectOrLeakCredentials(t *testing.T) {
	e := newTestEngine(t)
	e.initScopeProvider("synthetic-secret-only")
	p := e.scopeProvider
	calls := 0
	p.client.Transport = scopeRoundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("X-API-Key") != "synthetic-secret-only" || strings.Contains(r.URL.String(), "synthetic-secret-only") {
			t.Error("credential placement")
		}
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://elsewhere.test/"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})
	result := p.fetch(context.Background(), providerSource{URL: providerDirectory, Kind: "directory"})
	if calls != 1 || !result.failed || result.status != 302 {
		t.Fatal("redirect followed")
	}
	e.updateScopeSnapshot(time.Now())
	if strings.Contains(string(e.ScopesJSON()), "synthetic-secret-only") || strings.Contains(string(e.StateJSON()), "synthetic-secret-only") {
		t.Fatal("credential leaked")
	}
}

func TestProviderPersistsQuotaBeforeRequestAndRestoresCooldown(t *testing.T) {
	e := newTestEngine(t)
	e.initScopeProvider("synthetic-test-key")
	p := e.scopeProvider
	proof := make(chan bool, 1)
	p.client.Transport = scopeRoundTrip(func(r *http.Request) (*http.Response, error) {
		body, err := os.ReadFile(e.checkpoint)
		var saved checkpointV1
		var provider providerState
		ok := err == nil && json.Unmarshal(body, &saved) == nil && saved.Scopes != nil && json.Unmarshal(saved.Scopes.Provider, &provider) == nil
		ok = ok && provider.Requests == 1 && len(provider.Sources) == 1 && provider.Sources[0].Next > time.Now().UnixMilli() && !strings.Contains(string(body), "synthetic-test-key")
		proof <- ok
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"country":"CA","zones":[]}`)), Request: r}, nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	go e.Run(ctx)
	select {
	case ok := <-proof:
		if !ok {
			t.Error("request preceded durable quota/cooldown")
		}
	case <-time.After(3 * time.Second):
		t.Error("provider did not run")
	}
	cancel()
	e.Wait()
	restored, err := New(Options{Checkpoint: e.checkpoint, MeshMapperKey: "synthetic-test-key"})
	if err != nil || restored.scopeProvider.state.Requests != 1 || restored.scopeProvider.state.Sources[0].Next <= time.Now().UnixMilli() {
		t.Fatal("restart lost budget/cooldown", err)
	}
}

func TestProviderRevocationAndKeyChangeKeepNativeEvidence(t *testing.T) {
	e := newTestEngine(t)
	now := time.Now().UnixMilli()
	key := strings.Repeat("AB", 32)
	e.upsertNode("YKF", key, "Fixture", "repeater", false, 43, -80, true, now)
	e.initScopeProvider("synthetic-key-one")
	e.scopes.Observe(key, "*", now, true)
	e.scopes.PutReport(scopes.Report{Key: key, Region: "YKF", Source: "mqtt-self", List: true, Entries: []scopes.Entry{{Name: "#native"}}}, now)
	e.scopes.PutReport(scopes.Report{Key: key, Region: "YKF", Source: "meshmapper-reported", List: true, Entries: []scopes.Entry{{Name: "#provider"}}}, now)
	e.scopes.Provider, _ = json.Marshal(e.scopeProvider.state)
	e.initScopeProvider("synthetic-key-two")
	saved := e.scopes.Save()
	if len(saved.Reports) != 1 || saved.Reports[0].Source != "mqtt-self" || len(saved.Buckets) != 1 {
		t.Fatal("key change did not separate provider cache and native evidence")
	}
	p := e.scopeProvider
	task := p.state.Sources[0]
	p.apply(e, task, providerResult{status: 503, failed: true, retryAt: now + 3*scopes.Hour}, now)
	if p.state.Next < now+3*scopes.Hour {
		t.Fatal("shared quota retry-after ignored")
	}
}
