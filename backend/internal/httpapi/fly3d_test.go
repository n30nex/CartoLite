package httpapi

import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
    "testing/fstest"
)

func TestFly3DCanonicalPage(t *testing.T) {
    server := &Server{static: fstest.MapFS{"fly-3d/index.html": {Data: []byte("<title>CartoLite Fly 3D</title>")}}}
    for _, method := range []string{http.MethodGet, http.MethodHead} {
        response := httptest.NewRecorder()
        server.Handler().ServeHTTP(response, httptest.NewRequest(method, "/fly-3d?node=synthetic", nil))
        if response.Code != http.StatusPermanentRedirect || response.Header().Get("Location") != "/fly-3d/?node=synthetic" {
            t.Fatalf("flight redirect: %d %q", response.Code, response.Header().Get("Location"))
        }
        response = httptest.NewRecorder()
        server.Handler().ServeHTTP(response, httptest.NewRequest(method, "/fly-3d/", nil))
        if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "public, no-cache, no-transform" {
            t.Fatalf("flight response: %d", response.Code)
        }
        if method == http.MethodGet && !strings.Contains(response.Body.String(), "CartoLite Fly 3D") { t.Fatal("wrong flight document") }
        if method == http.MethodHead && response.Body.Len() != 0 { t.Fatal("HEAD returned a body") }
    }
}
