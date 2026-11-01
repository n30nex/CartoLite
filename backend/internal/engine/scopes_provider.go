package engine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/n30nex/cartolite/backend/internal/scopes"
)

const providerDirectory = "https://meshmapper.net/get_zones.php?country=CA"
const providerDailyBudget = 96 // A conservative share of the credential's shared read allowance.
var providerHost = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}\.meshmapper\.net$`)

type scopeCommand struct {
	apply   func(*Engine) (bool, error)
	durable bool
	done    chan error
}

func (e *Engine) scopeCommand(ctx context.Context, apply func(*Engine) (bool, error), durable bool) error {
	c := scopeCommand{apply: apply, durable: durable, done: make(chan error, 1)}
	select {
	case e.scopeCommands <- c:
	case <-ctx.Done():
		return ctx.Err()
	case <-e.done:
		return errors.New("scope engine stopped")
	}
	select {
	case err := <-c.done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	case <-e.done:
		return errors.New("scope engine stopped")
	}
}

type providerSource struct {
	URL     string `json:"url"`
	Region  string `json:"region"`
	Kind    string `json:"kind"`
	ETag    string `json:"etag,omitempty"`
	Next    int64  `json:"next"`
	Checked int64  `json:"checked,omitempty"`
	Status  string `json:"status,omitempty"`
}
type providerState struct {
	Credential string           `json:"credential"`
	Day        int64            `json:"day"`
	Requests   int              `json:"requests"`
	Next       int64            `json:"next"`
	Sources    []providerSource `json:"sources"`
}
type scopeProvider struct {
	key    string
	state  providerState
	client *http.Client
}
type providerResult struct {
	status    int
	etag      string
	retryAt   int64
	sources   []providerSource
	catalogue scopes.Catalogue
	reports   []scopes.Report
	failed    bool
}

func (e *Engine) initScopeProvider(key string) {
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 256 || strings.ContainsAny(key, "\r\n\x00") {
		e.scopes.ClearProvider("", time.Now().UnixMilli())
		e.scopes.Provider = nil
		return
	}
	fingerprint := sha256.Sum256([]byte(key))
	p := &scopeProvider{key: key, state: providerState{Credential: hex.EncodeToString(fingerprint[:])}}
	var saved providerState
	if json.Unmarshal(e.scopes.Provider, &saved) == nil && saved.Credential == p.state.Credential && len(saved.Sources) <= 513 && saved.Requests >= 0 && saved.Requests <= providerDailyBudget {
		p.state = saved
		valid := p.state.Sources[:0]
		for _, source := range p.state.Sources {
			if validProviderSource(source) && len(source.ETag) <= 256 {
				valid = append(valid, source)
			}
		}
		p.state.Sources = valid
	} else {
		e.scopes.ClearProvider("", time.Now().UnixMilli())
	}
	hasDirectory := false
	for _, source := range p.state.Sources {
		hasDirectory = hasDirectory || source.Kind == "directory"
	}
	if !hasDirectory {
		p.state.Sources = append(p.state.Sources, providerSource{URL: providerDirectory, Kind: "directory"})
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	p.client = &http.Client{Transport: transport, Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	e.scopeProvider = p
}

func validProviderSource(source providerSource) bool {
	if source.Kind == "directory" {
		return source.URL == providerDirectory && source.Region == ""
	}
	if !validCheckpointRegion(source.Region) {
		return false
	}
	u, err := url.Parse(source.URL)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || !providerHost.MatchString(u.Hostname()) || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	return source.Kind == "scopes" && u.Path == "/get_scopes.php" || source.Kind == "repeaters" && u.Path == "/get_repeaters.php"
}

func (p *scopeProvider) run(ctx context.Context, e *Engine) {
	defer p.client.CloseIdleConnections()
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		var task *providerSource
		err := e.scopeCommand(ctx, func(e *Engine) (bool, error) {
			now := time.Now().UnixMilli()
			if p.state.Day != now/(24*scopes.Hour) {
				p.state.Day = now / (24 * scopes.Hour)
				p.state.Requests = 0
			}
			if p.state.Next > now || p.state.Requests >= providerDailyBudget {
				return false, nil
			}
			weights := make(map[string]int)
			for _, n := range e.nodes {
				if n.Role == "repeater" {
					weights[n.Region]++
				}
			}
			index := -1
			for i, source := range p.state.Sources {
				if source.Next > now || source.Kind != "directory" && weights[source.Region] == 0 {
					continue
				}
				if index < 0 || source.Kind == "directory" || (p.state.Sources[index].Kind != "directory" && (source.Checked < p.state.Sources[index].Checked || source.Checked == p.state.Sources[index].Checked && weights[source.Region] > weights[p.state.Sources[index].Region])) {
					index = i
				}
			}
			if index < 0 {
				return false, nil
			}
			source := &p.state.Sources[index]
			copy := *source
			task = &copy
			source.Next = now + 6*scopes.Hour
			if source.Kind != "scopes" {
				source.Next = now + 24*scopes.Hour
			}
			source.Status = "pending"
			p.state.Requests++
			p.state.Next = now + time.Minute.Milliseconds()
			e.scopes.Provider, _ = json.Marshal(p.state)
			return true, nil
		}, true)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			e.log.Warn("scope catalogue request deferred: checkpoint unavailable")
		}
		if err == nil && task != nil {
			result := p.fetch(ctx, *task)
			_ = e.scopeCommand(ctx, func(e *Engine) (bool, error) { p.apply(e, *task, result, time.Now().UnixMilli()); return true, nil }, true)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (p *scopeProvider) fetch(ctx context.Context, source providerSource) providerResult {
	result := providerResult{failed: true}
	if !validProviderSource(source) {
		return result
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return result
	}
	req.Header.Set("X-API-Key", p.key)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "CartoLite-Canada/scopes")
	if source.ETag != "" {
		req.Header.Set("If-None-Match", source.ETag)
	}
	response, err := p.client.Do(req)
	if err != nil {
		return result
	}
	defer response.Body.Close()
	result.status = response.StatusCode
	if wait, err := strconv.ParseInt(response.Header.Get("Retry-After"), 10, 64); err == nil && wait > 0 && wait < 31*24*3600 {
		result.retryAt = time.Now().Add(time.Duration(wait) * time.Second).UnixMilli()
	} else if at, err := http.ParseTime(response.Header.Get("Retry-After")); err == nil {
		result.retryAt = at.UnixMilli()
	}
	if response.StatusCode == http.StatusNotModified {
		result.failed = false
		return result
	}
	if response.StatusCode != http.StatusOK {
		return result
	}
	limit := int64(128 * 1024)
	if source.Kind == "directory" {
		limit = 512 * 1024
	} else if source.Kind == "repeaters" {
		limit = 8 * 1024 * 1024
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || int64(len(body)) > limit {
		return result
	}
	if etag := response.Header.Get("ETag"); len(etag) <= 256 && !strings.ContainsAny(etag, "\r\n") {
		result.etag = etag
	}
	// Decode bounded responses off the ingest owner; only validated metadata is
	// applied on its event loop. Provider traffic aggregates are never decoded.
	valid := false
	switch source.Kind {
	case "directory":
		result.sources, valid = decodeProviderDirectory(body)
	case "scopes":
		result.catalogue, valid = decodeProviderCatalogue(source.Region, body, time.Now().UnixMilli())
	case "repeaters":
		result.reports, valid = decodeProviderReports(body, time.Now().UnixMilli())
	}
	result.failed = !valid
	return result
}

func (p *scopeProvider) apply(e *Engine, task providerSource, result providerResult, now int64) {
	index := -1
	for i, s := range p.state.Sources {
		if s.URL == task.URL {
			index = i
			break
		}
	}
	if index < 0 {
		return
	}
	if result.status == 401 || result.status == 403 {
		if result.status == 401 || task.Kind == "directory" {
			e.scopes.ClearProvider("", now)
		} else {
			e.scopes.ClearProvider(task.Region, now)
		}
		p.state.Sources[index].ETag = ""
		p.state.Next = max(p.state.Next, now+24*scopes.Hour)
	}
	if result.status == 429 || result.status == 503 {
		p.state.Next = max(p.state.Next, max(result.retryAt, now+scopes.Hour))
	}
	if result.retryAt > p.state.Sources[index].Next {
		p.state.Sources[index].Next = result.retryAt
	}
	status := "unavailable"
	if !result.failed && result.status == http.StatusNotModified && task.Checked > 0 {
		status = "ready"
	}
	if !result.failed && result.status == http.StatusOK {
		switch task.Kind {
		case "directory":
			if next := result.sources; next != nil {
				old := make(map[string]providerSource)
				for _, s := range p.state.Sources {
					old[s.URL] = s
				}
				for i, s := range next {
					if prior, exists := old[s.URL]; exists && prior.Region == s.Region {
						next[i] = prior
					}
					delete(old, s.URL)
				}
				for _, s := range old {
					if s.Kind != "directory" {
						e.scopes.ClearProvider(s.Region, now)
					}
				}
				next = append(next, p.state.Sources[index])
				p.state.Sources = next
				index = len(next) - 1
				status = "ready"
			}
		case "scopes":
			if e.scopes.PutCatalogue(result.catalogue, now) {
				status = "ready"
			}
		case "repeaters":
			if reports := result.reports; reports != nil {
				allowed := make(map[string]bool)
				for _, s := range p.state.Sources {
					if s.Region != "" {
						allowed[s.Region] = true
					}
				}
				accepted := reports[:0]
				for _, r := range reports {
					if allowed[r.Region] && e.nodes[nodeMapKey(r.Region, r.Key)] != nil {
						accepted = append(accepted, r)
					}
				}
				e.scopes.PutReports(accepted, now)
				status = "ready"
			}
		}
	}
	p.state.Sources[index].Status = status
	if status == "ready" {
		p.state.Sources[index].Checked = now
		if result.status == http.StatusOK {
			p.state.Sources[index].ETag = result.etag
		}
	}
	e.scopes.Provider, _ = json.Marshal(p.state)
	e.updateScopeSnapshot(time.UnixMilli(now))
	// Status and counts only. Never log the request, header, body or decoder error.
	e.log.Info("scope catalogue refresh", "kind", task.Kind, "region", task.Region, "status", status, "httpStatus", result.status)
}

func decodeProviderDirectory(body []byte) ([]providerSource, bool) {
	var data struct {
		Country string `json:"country"`
		Zones   []struct {
			Code    string `json:"code"`
			Country string `json:"country"`
			URL     string `json:"url"`
		} `json:"zones"`
	}
	if json.Unmarshal(body, &data) != nil || data.Country != "CA" || len(data.Zones) > 256 {
		return nil, false
	}
	out := []providerSource{}
	seen := make(map[string]bool)
	for _, zone := range data.Zones {
		if zone.Country != "CA" || !validCheckpointRegion(zone.Code) {
			return nil, false
		}
		u, err := url.Parse(zone.URL)
		if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || !providerHost.MatchString(u.Hostname()) || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
			return nil, false
		}
		for _, kind := range []string{"scopes", "repeaters"} {
			source := providerSource{URL: "https://" + u.Host + "/get_" + kind + ".php", Region: zone.Code, Kind: kind}
			if !seen[source.URL] {
				out = append(out, source)
				seen[source.URL] = true
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].URL < out[j].URL })
	return out, true
}

func decodeProviderCatalogue(region string, body []byte, now int64) (scopes.Catalogue, bool) {
	var data struct {
		Generated string `json:"generated_at"`
		Region    string `json:"region"`
		Scopes    []struct {
			Name string `json:"name"`
		} `json:"scopes"`
	}
	if json.Unmarshal(body, &data) != nil || strings.ToUpper(data.Region) != region || len(data.Scopes) > scopes.MaxNames {
		return scopes.Catalogue{}, false
	}
	at, err := time.Parse(time.RFC3339, data.Generated)
	if err != nil || at.UnixMilli() > now || at.UnixMilli() < now-30*24*scopes.Hour {
		return scopes.Catalogue{}, false
	}
	out := scopes.Catalogue{Region: region, At: at.UnixMilli(), Names: []string{}}
	for _, s := range data.Scopes {
		name, ok := scopes.Name(s.Name)
		if !ok {
			return scopes.Catalogue{}, false
		}
		out.Names = append(out.Names, name)
	}
	return out, true
}

func decodeProviderReports(body []byte, now int64) ([]scopes.Report, bool) {
	var rows []struct {
		Key    string `json:"hex_id"`
		Region string `json:"iata"`
		Scopes []struct {
			Name     string `json:"scope"`
			Reported *int64 `json:"reported_at"`
			Uploaded *int64 `json:"uploaded_at"`
		} `json:"scopes"`
		Checked       *int64  `json:"scopes_checked_at"`
		Default       *string `json:"default_scope"`
		DefaultState  string  `json:"default_scope_state"`
		DefaultAt     *int64  `json:"default_scope_at"`
		DefaultSource string  `json:"default_scope_src"`
	}
	if json.Unmarshal(body, &rows) != nil || len(rows) > 10000 {
		return nil, false
	}
	at := func(value *int64) int64 {
		if value == nil || *value <= 0 || *value > now/1000 {
			return 0
		}
		return *value * 1000
	}
	out := make([]scopes.Report, 0)
	for _, row := range rows {
		key := strings.ToUpper(row.Key)
		if !scopes.FullKey(key) || !validCheckpointRegion(row.Region) || len(row.Scopes) > scopes.MaxNames {
			continue
		}
		for _, source := range []string{"meshmapper-reported", "meshmapper-uploaded"} {
			r := scopes.Report{Key: key, Region: row.Region, Source: source, List: true, Entries: []scopes.Entry{}}
			for _, entry := range row.Scopes {
				stamp := at(entry.Reported)
				if source == "meshmapper-uploaded" {
					stamp = at(entry.Uploaded)
				}
				name, ok := scopes.Name(entry.Name)
				if stamp > 0 && ok {
					r.Entries = append(r.Entries, scopes.Entry{Name: name, At: stamp})
					r.At = max(r.At, stamp)
				}
			}
			if source == "meshmapper-reported" && row.Scopes != nil && len(row.Scopes) == 0 {
				r.At = at(row.Checked)
			}
			if r.At > 0 {
				out = append(out, r)
			}
		}
		if row.DefaultState != "" && (row.DefaultSource == "advert" || row.DefaultSource == "reported") {
			r := scopes.Report{Key: key, Region: row.Region, Source: "meshmapper-default", At: at(row.DefaultAt), DefaultState: row.DefaultState, DefaultSource: row.DefaultSource}
			if row.Default != nil {
				r.Default = *row.Default
			}
			out = append(out, r)
		}
	}
	return out, true
}
