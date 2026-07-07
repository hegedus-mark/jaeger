// Copyright (c) 2024 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

package jaegerstorage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/confmap"
	"go.opentelemetry.io/collector/confmap/confmaptest"
)

func loadConf(t *testing.T, config string) *confmap.Conf {
	d := t.TempDir()
	f := filepath.Join(d, "config.yaml")
	require.NoError(t, os.WriteFile(f, []byte(config), 0o644))
	cm, err := confmaptest.LoadConf(f)
	require.NoError(t, err)
	return cm
}

func TestConfigValidateNoBackends(t *testing.T) {
	conf := loadConf(t, `
backends:
`)
	cfg := createDefaultConfig().(*Config)
	require.NoError(t, conf.Unmarshal(cfg))
	require.EqualError(t, cfg.Validate(), "at least one storage backend is required")
}

func TestConfigValidateEmptyBackend(t *testing.T) {
	conf := loadConf(t, `
backends:
  some_storage:
`)
	cfg := createDefaultConfig().(*Config)
	require.NoError(t, conf.Unmarshal(cfg))
	require.EqualError(t, cfg.Validate(), "trace storage 'some_storage': empty configuration")
}

func TestConfigDefaultMemory(t *testing.T) {
	conf := loadConf(t, `
backends:
  some_storage:
    memory:
`)
	cfg := createDefaultConfig().(*Config)
	require.NoError(t, conf.Unmarshal(cfg))
	assert.NotEmpty(t, cfg.TraceBackends["some_storage"].Memory.MaxTraces)
}

func TestConfigDefaultElasticsearch(t *testing.T) {
	conf := loadConf(t, `
backends:
  some_storage:
    elasticsearch:
`)
	cfg := createDefaultConfig().(*Config)
	require.NoError(t, conf.Unmarshal(cfg))
	assert.NotEmpty(t, cfg.TraceBackends["some_storage"].Elasticsearch.Servers)
}

func TestConfigDefaultElasticsearchAsMetricsBackend(t *testing.T) {
	conf := loadConf(t, `
metric_backends:
  some_metrics_storage:
    elasticsearch:
`)
	cfg := createDefaultConfig().(*Config)
	require.NoError(t, conf.Unmarshal(cfg))
	assert.NotEmpty(t, cfg.MetricBackends["some_metrics_storage"].Elasticsearch.Servers)
}
