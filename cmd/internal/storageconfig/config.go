// Copyright (c) 2025 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

package storageconfig

import (
	"errors"
	"fmt"

	"go.opentelemetry.io/collector/confmap"

	escfg "github.com/jaegertracing/jaeger/internal/storage/elasticsearch/config"
	"github.com/jaegertracing/jaeger/internal/storage/v2/memory"
)

var (
	_ confmap.Unmarshaler = (*TraceBackend)(nil)
	_ confmap.Unmarshaler = (*MetricBackend)(nil)
)

// Config contains configuration(s) for Jaeger trace storage.
type Config struct {
	TraceBackends  map[string]TraceBackend  `mapstructure:"backends"`
	MetricBackends map[string]MetricBackend `mapstructure:"metric_backends"`
}

// TraceBackend contains configuration for a single trace storage backend.
type TraceBackend struct {
	Memory        *memory.Configuration `mapstructure:"memory"`
	Elasticsearch *escfg.Configuration  `mapstructure:"elasticsearch"`
}

// MetricBackend contains configuration for a single metric storage backend.
type MetricBackend struct {
	Elasticsearch *escfg.Configuration `mapstructure:"elasticsearch"`
}

// Unmarshal implements confmap.Unmarshaler. This allows us to provide
// defaults for different configs.
func (cfg *TraceBackend) Unmarshal(conf *confmap.Conf) error {
	// apply defaults
	if conf.IsSet("memory") {
		cfg.Memory = &memory.Configuration{
			MaxTraces: 1_000_000,
		}
	}
	if conf.IsSet("elasticsearch") {
		v := escfg.DefaultConfig()
		cfg.Elasticsearch = &v
	}
	return conf.Unmarshal(cfg)
}

func (cfg *TraceBackend) Validate() error {
	var backends []string
	if cfg.Memory != nil {
		backends = append(backends, "memory")
	}
	if cfg.Elasticsearch != nil {
		backends = append(backends, "elasticsearch")
	}
	if len(backends) == 0 {
		return errors.New("empty configuration")
	}
	if len(backends) > 1 {
		return fmt.Errorf("multiple backend types found for trace storage: %v", backends)
	}
	return nil
}

// Unmarshal implements confmap.Unmarshaler for MetricBackend.
func (cfg *MetricBackend) Unmarshal(conf *confmap.Conf) error {
	// apply defaults
	if conf.IsSet("elasticsearch") {
		v := escfg.DefaultConfig()
		cfg.Elasticsearch = &v
	}
	return conf.Unmarshal(cfg)
}

func (cfg *MetricBackend) Validate() error {
	var backends []string
	if cfg.Elasticsearch != nil {
		backends = append(backends, "elasticsearch")
	}
	if len(backends) == 0 {
		return errors.New("empty configuration")
	}
	if len(backends) > 1 {
		return fmt.Errorf("multiple backend types found for metric storage: %v", backends)
	}
	return nil
}

// Validate validates the storage configuration.
func (c *Config) Validate() error {
	if len(c.TraceBackends) == 0 {
		return errors.New("at least one storage backend is required")
	}
	for name, b := range c.TraceBackends {
		if err := b.Validate(); err != nil {
			return fmt.Errorf("trace storage '%s': %w", name, err)
		}
	}
	for name, b := range c.MetricBackends {
		if err := b.Validate(); err != nil {
			return fmt.Errorf("metric storage '%s': %w", name, err)
		}
	}
	return nil
}
