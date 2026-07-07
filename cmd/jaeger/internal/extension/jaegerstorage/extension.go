// Copyright (c) 2023 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

package jaegerstorage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"

	"go.opentelemetry.io/collector/component"
	"go.opentelemetry.io/collector/extension"
	"go.opentelemetry.io/collector/extension/extensionauth"

	"github.com/jaegertracing/jaeger/cmd/internal/storageconfig"
	"github.com/jaegertracing/jaeger/internal/metrics"
	"github.com/jaegertracing/jaeger/internal/metrics/otelmetrics"
	"github.com/jaegertracing/jaeger/internal/storage/elasticsearch/config"
	"github.com/jaegertracing/jaeger/internal/storage/v2/api/metricstore"
	"github.com/jaegertracing/jaeger/internal/storage/v2/api/tracestore"
	"github.com/jaegertracing/jaeger/internal/telemetry"
)

var _ Extension = (*storageExt)(nil)

type Extension interface {
	extension.Extension
	TraceStorageFactory(name string) (tracestore.Factory, error)
	MetricStorageFactory(name string) (metricstore.Factory, error)
}

type storageExt struct {
	config    *Config
	telset    telemetry.Settings
	factories map[string]tracestore.Factory
	factoryMu sync.Mutex
}

// getStorageFactory locates the extension in Host and retrieves
// a trace storage factory from it with the given name.
func getStorageFactory(name string, host component.Host) (tracestore.Factory, error) {
	ext, err := findExtension(host)
	if err != nil {
		return nil, err
	}
	return ext.TraceStorageFactory(name)
}

func GetTraceStoreFactory(name string, host component.Host) (tracestore.Factory, error) {
	f, err := getStorageFactory(name, host)
	if err != nil {
		return nil, err
	}

	return f, nil
}

func GetMetricStorageFactory(name string, host component.Host) (metricstore.Factory, error) {
	ext, err := findExtension(host)
	if err != nil {
		return nil, err
	}
	return ext.MetricStorageFactory(name)
}

func (s *storageExt) MetricStorageFactory(name string) (metricstore.Factory, error) {
	return nil, fmt.Errorf("cannot find metrics storage factory: metrics storage is not supported in this version")
}

func findExtension(host component.Host) (Extension, error) {
	var id component.ID
	var comp component.Component
	for i, ext := range host.GetExtensions() {
		if i.Type() == componentType {
			id, comp = i, ext
			break
		}
	}
	if comp == nil {
		return nil, fmt.Errorf(
			"cannot find extension '%s' (make sure it's defined earlier in the config)",
			componentType,
		)
	}
	ext, ok := comp.(Extension)
	if !ok {
		return nil, fmt.Errorf("extension '%s' is not of expected type '%s'", id, componentType)
	}
	return ext, nil
}

func newStorageExt(cfg *Config, telset component.TelemetrySettings) *storageExt {
	// Initialize telemetry.Settings with host=nil, will be set in Start()
	tset := telemetry.Settings{
		Logger:         telset.Logger,
		MeterProvider:  telset.MeterProvider,
		TracerProvider: telset.TracerProvider,
	}
	return &storageExt{
		config:    cfg,
		telset:    tset,
		factories: make(map[string]tracestore.Factory),
	}
}

func (s *storageExt) Start(_ context.Context, host component.Host) error {
	// Set host in telset for use in lazy factory initialization
	s.telset.Host = host
	s.telset.Metrics = otelmetrics.NewFactory(s.telset.MeterProvider).Namespace(metrics.NSOptions{Name: "jaeger"})

	// Validate configurations early to catch errors at startup
	for name, cfg := range s.config.TraceBackends {
		if err := cfg.Validate(); err != nil {
			return fmt.Errorf("invalid configuration for trace storage '%s': %w", name, err)
		}
	}

	return nil
}

func (s *storageExt) Shutdown(context.Context) error {
	var errs []error
	for _, factory := range s.factories {
		if closer, ok := factory.(io.Closer); ok {
			err := closer.Close()
			if err != nil {
				errs = append(errs, err)
			}
		}
	}
	return errors.Join(errs...)
}

func (s *storageExt) TraceStorageFactory(name string) (tracestore.Factory, error) {
	s.factoryMu.Lock()
	defer s.factoryMu.Unlock()

	// Return cached factory if already created
	if f, ok := s.factories[name]; ok {
		return f, nil
	}

	// Check if configuration exists
	cfg, ok := s.config.TraceBackends[name]
	if !ok {
		return nil, fmt.Errorf(
			"storage '%s' not declared in '%s' extension configuration",
			name, componentType,
		)
	}

	// Create factory on demand
	factory, err := storageconfig.CreateTraceStorageFactory(
		context.Background(),
		name,
		cfg,
		s.telset,
		func(authCfg config.Authentication, backendType, backendName string) (extensionauth.HTTPClient, error) {
			return s.resolveAuthenticator(s.telset.Host, authCfg, backendType, backendName)
		},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize storage '%s': %w", name, err)
	}

	s.factories[name] = factory
	return factory, nil
}

// getAuthenticator retrieves an HTTP authenticator extension from the host by name.
func (*storageExt) getAuthenticator(host component.Host, authenticatorName string) (extensionauth.HTTPClient, error) {
	if authenticatorName == "" {
		return nil, nil
	}

	for id, ext := range host.GetExtensions() {
		if id.String() == authenticatorName || id.Name() == authenticatorName {
			if httpAuth, ok := ext.(extensionauth.HTTPClient); ok {
				return httpAuth, nil
			}
			return nil, fmt.Errorf("extension '%s' does not implement extensionauth.HTTPClient", authenticatorName)
		}
	}
	return nil, fmt.Errorf("authenticator extension '%s' not found", authenticatorName)
}

// resolveAuthenticator is a helper to resolve and validate HTTP authenticator for a backend
func (s *storageExt) resolveAuthenticator(host component.Host, authCfg config.Authentication, backendType, backendName string) (extensionauth.HTTPClient, error) {
	if authCfg.AuthenticatorID.String() == "" {
		return nil, nil
	}

	httpAuth, err := s.getAuthenticator(host, authCfg.AuthenticatorID.String())
	if err != nil {
		return nil, fmt.Errorf("failed to get HTTP authenticator for %s backend '%s': %w", backendType, backendName, err)
	}
	s.telset.Logger.Sugar().Infof("HTTP auth configured for %s backend '%s' with authenticator '%s'",
		backendType, backendName, authCfg.AuthenticatorID.String())
	return httpAuth, nil
}
