// Copyright (c) 2024 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

package jaegerstorage

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/open-telemetry/opentelemetry-collector-contrib/extension/storage/storagetest"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/component"
	"go.opentelemetry.io/collector/component/componenttest"
	"go.opentelemetry.io/collector/config/configauth"
	"go.opentelemetry.io/collector/extension"
	noopmetric "go.opentelemetry.io/otel/metric/noop"
	nooptrace "go.opentelemetry.io/otel/trace/noop"
	"go.uber.org/zap"

	"github.com/jaegertracing/jaeger/cmd/internal/storageconfig"
	escfg "github.com/jaegertracing/jaeger/internal/storage/elasticsearch/config"
	"github.com/jaegertracing/jaeger/internal/storage/v2/api/tracestore"
	"github.com/jaegertracing/jaeger/internal/storage/v2/memory"
	"github.com/jaegertracing/jaeger/internal/telemetry"
)

type errorFactory struct {
	closeErr error
}

func (errorFactory) CreateTraceReader() (tracestore.Reader, error) {
	panic("not implemented")
}

func (errorFactory) CreateTraceWriter() (tracestore.Writer, error) {
	panic("not implemented")
}

func (e errorFactory) Close() error {
	return e.closeErr
}

func setupMockServer(t *testing.T, response []byte, statusCode int) *httptest.Server {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		w.Write(response)
	}))
	require.NotNil(t, mockServer)
	t.Cleanup(mockServer.Close)

	return mockServer
}

func getVersionResponse(t *testing.T) []byte {
	versionResponse, e := json.Marshal(map[string]any{
		"Version": map[string]any{
			"Number": "8.0.0",
		},
	})
	require.NoError(t, e)
	return versionResponse
}

func TestStorageFactoryBadHostError(t *testing.T) {
	_, err := getStorageFactory("something", componenttest.NewNopHost())
	require.ErrorContains(t, err, "cannot find extension")
}

func TestStorageFactoryBadNameError(t *testing.T) {
	host := storagetest.NewStorageHost().WithExtension(ID, startStorageExtension(t, "foo"))
	_, err := getStorageFactory("bar", host)
	require.ErrorContains(t, err, "not declared in")
}

func TestGetTraceStoreFactory_Memory(t *testing.T) {
	host := storagetest.NewStorageHost().WithExtension(ID, startStorageExtension(t, "memory"))
	factory, err := GetTraceStoreFactory("memory", host)
	require.NoError(t, err)
	require.NotNil(t, factory)
}

func TestGetTraceStoreFactory_Elasticsearch(t *testing.T) {
	server := setupMockServer(t, getVersionResponse(t), http.StatusOK)
	config := storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			"es": {
				Elasticsearch: &escfg.Configuration{
					Servers:  []string{server.URL},
					LogLevel: "error",
				},
			},
		},
	}
	ext := makeStorageExtension(t, config)
	host := storagetest.NewStorageHost().WithExtension(ID, ext)
	err := ext.Start(t.Context(), host)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, ext.Shutdown(context.Background()))
	})

	factory, err := GetTraceStoreFactory("es", host)
	require.NoError(t, err)
	require.NotNil(t, factory)
}

func TestShutdownWithCloser(t *testing.T) {
	ext := &storageExt{
		factories: map[string]tracestore.Factory{
			"foo": errorFactory{},
		},
	}

	err := ext.Shutdown(context.Background())
	require.NoError(t, err)
}

func TestShutdownError(t *testing.T) {
	closeErr := errors.New("close error")
	ext := &storageExt{
		factories: map[string]tracestore.Factory{
			"foo": errorFactory{closeErr: closeErr},
		},
	}

	err := ext.Shutdown(context.Background())
	require.ErrorIs(t, err, closeErr)
}

func TestElasticsearch(t *testing.T) {
	server := setupMockServer(t, getVersionResponse(t), http.StatusOK)
	ext := makeStorageExtension(t, storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			"foo": {
				Elasticsearch: &escfg.Configuration{
					Servers:  []string{server.URL},
					LogLevel: "error",
				},
			},
		},
	})
	ctx := t.Context()
	err := ext.Start(ctx, componenttest.NewNopHost())
	require.NoError(t, err)
	require.NoError(t, ext.Shutdown(ctx))
}

func noopTelemetrySettings() component.TelemetrySettings {
	return component.TelemetrySettings{
		Logger:         zap.L(),
		TracerProvider: nooptrace.NewTracerProvider(),
		MeterProvider:  noopmetric.NewMeterProvider(),
	}
}

func makeStorageExtension(t *testing.T, config storageconfig.Config) component.Component {
	extensionFactory := NewFactory()
	ctx := t.Context()
	ext, err := extensionFactory.Create(
		ctx,
		extension.Settings{
			ID:                ID,
			TelemetrySettings: noopTelemetrySettings(),
			BuildInfo:         component.NewDefaultBuildInfo(),
		},
		&Config{Config: config},
	)
	require.NoError(t, err)
	return ext
}

func TestStorageBackend_DefaultCases(t *testing.T) {
	config := storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			"unconfigured": {},
		},
	}

	ext := makeStorageExtension(t, config)
	err := ext.Start(t.Context(), componenttest.NewNopHost())

	require.Error(t, err)
	require.Contains(t, err.Error(), "empty configuration")
}

func startStorageExtension(t *testing.T, memstoreName string) component.Component {
	config := storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			memstoreName: {
				Memory: &memory.Configuration{
					MaxTraces: 10000,
				},
			},
		},
	}
	require.NoError(t, (&Config{Config: config}).Validate())

	ext := makeStorageExtension(t, config)
	err := ext.Start(t.Context(), componenttest.NewNopHost())
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, ext.Shutdown(context.Background()))
	})
	return ext
}

// Test authenticator resolution - success case
func TestGetAuthenticator_Success(t *testing.T) {
	mockAuth := &mockHTTPAuthenticator{}

	host := storagetest.NewStorageHost().
		WithExtension(component.MustNewIDWithName("sigv4auth", "sigv4auth"), mockAuth)

	cfg := &Config{}
	ext := newStorageExt(cfg, noopTelemetrySettings())

	auth, err := ext.getAuthenticator(host, "sigv4auth")

	require.NoError(t, err)
	require.NotNil(t, auth)
	require.Same(t, mockAuth, auth)
}

// Test getAuthenticator with non-existent extension ID
func TestGetAuthenticator_NotFound(t *testing.T) {
	host := storagetest.NewStorageHost()
	cfg := &Config{}
	ext := newStorageExt(cfg, noopTelemetrySettings())

	auth, err := ext.getAuthenticator(host, "nonexistent")

	require.Error(t, err)
	require.Nil(t, auth)
	require.Contains(t, err.Error(), "authenticator extension 'nonexistent' not found")
}

// Test getAuthenticator with extension that does not implement extensionauth.HTTPClient
func TestGetAuthenticator_WrongType(t *testing.T) {
	wrongAuth := &mockNonHTTPExtension{}

	host := storagetest.NewStorageHost().
		WithExtension(component.MustNewIDWithName("wrongtype", "wrongtype"), wrongAuth)

	cfg := &Config{}
	ext := newStorageExt(cfg, noopTelemetrySettings())

	auth, err := ext.getAuthenticator(host, "wrongtype")

	require.Error(t, err)
	require.Nil(t, auth)
	require.Contains(t, err.Error(), "does not implement extensionauth.HTTPClient")
}

type mockHTTPAuthenticator struct{}

var _ extension.Extension = (*mockHTTPAuthenticator)(nil)

func (*mockHTTPAuthenticator) Start(context.Context, component.Host) error {
	return nil
}

func (*mockHTTPAuthenticator) Shutdown(context.Context) error {
	return nil
}

func (*mockHTTPAuthenticator) RoundTripper(base http.RoundTripper) (http.RoundTripper, error) {
	return base, nil
}

type mockNonHTTPExtension struct{}

var _ extension.Extension = (*mockNonHTTPExtension)(nil)

func (*mockNonHTTPExtension) Start(context.Context, component.Host) error {
	return nil
}

func (*mockNonHTTPExtension) Shutdown(context.Context) error {
	return nil
}

// Test resolveAuthenticator
func TestResolveAuthenticator(t *testing.T) {
	const (
		backendType = "elasticsearch"
		backendName = "test"
	)

	tests := []struct {
		name        string
		authCfg     escfg.Authentication
		setupHost   func() component.Host
		wantErr     bool
		errContains string
	}{
		{
			name:      "empty authenticator returns nil",
			authCfg:   escfg.Authentication{},
			setupHost: componenttest.NewNopHost,
			wantErr:   false,
		},
		{
			name: "valid authenticator",
			authCfg: escfg.Authentication{
				Config: configauth.Config{
					AuthenticatorID: component.MustNewID("sigv4auth"),
				},
			},
			setupHost: func() component.Host {
				return storagetest.NewStorageHost().
					WithExtension(component.MustNewIDWithName("sigv4auth", "sigv4auth"), &mockHTTPAuthenticator{})
			},
			wantErr: false,
		},
		{
			name: "authenticator not found",
			authCfg: escfg.Authentication{
				Config: configauth.Config{
					AuthenticatorID: component.MustNewID("notfound"),
				},
			},
			setupHost:   componenttest.NewNopHost,
			wantErr:     true,
			errContains: "failed to get HTTP authenticator for elasticsearch backend 'test'",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			telset := telemetry.Settings{
				Logger:         zap.L(),
				TracerProvider: nooptrace.NewTracerProvider(),
				MeterProvider:  noopmetric.NewMeterProvider(),
			}
			ext := &storageExt{telset: telset}
			host := tt.setupHost()

			auth, err := ext.resolveAuthenticator(host, tt.authCfg, backendType, backendName)

			if tt.wantErr {
				require.Error(t, err)
				require.Contains(t, err.Error(), tt.errContains)
				return
			}
			require.NoError(t, err)
			// Check if authenticator ID is empty
			if tt.authCfg.AuthenticatorID.String() == "" {
				require.Nil(t, auth)
			} else {
				require.NotNil(t, auth)
			}
		})
	}
}

// Test getAuthenticator with empty authenticator name
func TestGetAuthenticatorEmptyName(t *testing.T) {
	cfg := &Config{}
	ext := newStorageExt(cfg, noopTelemetrySettings())

	host := componenttest.NewNopHost()

	// Call with empty authenticator name
	auth, err := ext.getAuthenticator(host, "")

	require.NoError(t, err)
	require.Nil(t, auth)
}

// Test Elasticsearch with valid authenticator integration
func TestElasticsearchWithAuthenticator(t *testing.T) {
	mockServer := setupMockServer(t, getVersionResponse(t), http.StatusOK)
	mockAuth := &mockHTTPAuthenticator{}

	ext := makeStorageExtension(t, storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			"elasticsearch": {
				Elasticsearch: &escfg.Configuration{
					Servers:  []string{mockServer.URL},
					LogLevel: "error",
					Authentication: escfg.Authentication{
						Config: configauth.Config{
							AuthenticatorID: component.MustNewID("sigv4auth"),
						},
					},
				},
			},
		},
	})
	host := storagetest.NewStorageHost().
		WithExtension(ID, ext).
		WithExtension(component.MustNewID("sigv4auth"), mockAuth)

	err := ext.Start(t.Context(), host)
	require.NoError(t, err)
	require.NoError(t, ext.Shutdown(t.Context()))
}

// Test Elasticsearch with missing authenticator
func TestElasticsearchWithMissingAuthenticator(t *testing.T) {
	mockServer := setupMockServer(t, getVersionResponse(t), http.StatusOK)

	ext := makeStorageExtension(t, storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			"elasticsearch": {
				Elasticsearch: &escfg.Configuration{
					Servers:  []string{mockServer.URL},
					LogLevel: "error",
					Authentication: escfg.Authentication{
						Config: configauth.Config{
							AuthenticatorID: component.MustNewID("nonexistent"),
						},
					},
				},
			},
		},
	})
	// With lazy initialization, Start() should not fail
	err := ext.Start(t.Context(), componenttest.NewNopHost())
	require.NoError(t, err)

	// Error should occur when accessing factory
	storageExt := ext.(Extension)
	_, err = storageExt.TraceStorageFactory("elasticsearch")
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to get HTTP authenticator")
}

// Test Elasticsearch with wrong authenticator type
func TestElasticsearchWithWrongAuthenticatorType(t *testing.T) {
	mockServer := setupMockServer(t, getVersionResponse(t), http.StatusOK)
	wrongAuth := &mockNonHTTPExtension{}

	ext := makeStorageExtension(t, storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			"elasticsearch": {
				Elasticsearch: &escfg.Configuration{
					Servers:  []string{mockServer.URL},
					LogLevel: "error",
					Authentication: escfg.Authentication{
						Config: configauth.Config{
							AuthenticatorID: component.MustNewID("wrongtype"),
						},
					},
				},
			},
		},
	})
	host := storagetest.NewStorageHost().
		WithExtension(ID, ext).
		WithExtension(component.MustNewID("wrongtype"), wrongAuth)

	// With lazy initialization, Start() should not fail
	err := ext.Start(t.Context(), host)
	require.NoError(t, err)

	// Error should occur when accessing factory
	storageExt := ext.(Extension)
	_, err = storageExt.TraceStorageFactory("elasticsearch")
	require.Error(t, err)
	require.Contains(t, err.Error(), "does not implement extensionauth.HTTPClient")
}

// TestLazyInitialization tests that factories are only created when accessed
func TestLazyInitialization(t *testing.T) {
	mockServer := setupMockServer(t, getVersionResponse(t), http.StatusOK)

	config := storageconfig.Config{
		TraceBackends: map[string]storageconfig.TraceBackend{
			"memory1": {
				Memory: &memory.Configuration{
					MaxTraces: 10000,
				},
			},
			"memory2": {
				Memory: &memory.Configuration{
					MaxTraces: 5000,
				},
			},
			"elasticsearch": {
				Elasticsearch: &escfg.Configuration{
					Servers:  []string{mockServer.URL},
					LogLevel: "error",
				},
			},
		},
	}

	ext := makeStorageExtension(t, config)
	storageExt := ext.(*storageExt)

	// Start should succeed without initializing any factories
	err := ext.Start(t.Context(), componenttest.NewNopHost())
	require.NoError(t, err)

	// Verify no factories have been created yet
	storageExt.factoryMu.Lock()
	require.Empty(t, storageExt.factories, "No factories should be initialized after Start()")
	storageExt.factoryMu.Unlock()

	// Access memory1 - should initialize only that factory
	f1, err := storageExt.TraceStorageFactory("memory1")
	require.NoError(t, err)
	require.NotNil(t, f1)

	storageExt.factoryMu.Lock()
	require.Len(t, storageExt.factories, 1, "Only one factory should be initialized")
	require.Contains(t, storageExt.factories, "memory1")
	storageExt.factoryMu.Unlock()

	// Access elasticsearch - should initialize another factory
	f2, err := storageExt.TraceStorageFactory("elasticsearch")
	require.NoError(t, err)
	require.NotNil(t, f2)

	storageExt.factoryMu.Lock()
	require.Len(t, storageExt.factories, 2, "Two factories should be initialized")
	require.Contains(t, storageExt.factories, "memory1")
	require.Contains(t, storageExt.factories, "elasticsearch")
	storageExt.factoryMu.Unlock()

	// Access memory1 again - should return cached factory
	f1Again, err := storageExt.TraceStorageFactory("memory1")
	require.NoError(t, err)
	require.Same(t, f1, f1Again, "Should return the same cached factory instance")

	// memory2 should still not be initialized
	storageExt.factoryMu.Lock()
	require.NotContains(t, storageExt.factories, "memory2", "memory2 should not be initialized yet")
	storageExt.factoryMu.Unlock()

	require.NoError(t, ext.Shutdown(t.Context()))
}
