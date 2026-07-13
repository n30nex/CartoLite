package config

import "testing"

func TestRegionAllowlistIsExact(t *testing.T) {
	t.Setenv("REGION_ALLOWLIST", "YKF,YYZ")
	regions, err := regionAllowlist()
	if err != nil || len(regions) != 2 {
		t.Fatalf("exact allowlist rejected: %v", err)
	}
	t.Setenv("REGION_ALLOWLIST", "YKF,*")
	if _, err := regionAllowlist(); err == nil {
		t.Fatal("wildcard allowlist entry accepted")
	}
}

func TestStatePathIsTheOnlyCheckpointSetting(t *testing.T) {
	t.Setenv("STATE_PATH", "/data/expected.json")
	t.Setenv("CHECKPOINT_PATH", "/data/ignored.json")
	config, err := Load("test", "abc")
	if err != nil {
		t.Fatal(err)
	}
	if config.Checkpoint != "/data/expected.json" {
		t.Fatalf("checkpoint path = %q, want STATE_PATH", config.Checkpoint)
	}
}
