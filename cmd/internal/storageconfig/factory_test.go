// Copyright (c) 2025 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

package storageconfig

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/extension/extensionauth"

	escfg "github.com/jaegertracing/jaeger/internal/storage/elasticsearch/config"
	"github.com/jaegertracing/jaeger/internal/storage/v2/memory"
	"github.com/jaegertracing/jaeger/internal/telemetry"
)

func getTelemetrySettings() telemetry.Settings {
	return telemetry.NoopSettings()
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

func TestCreateTraceStorageFactory_Memory(t *testing.T) {
	backend := TraceBackend{
		Memory: &memory.Configuration{
			MaxTraces: 10000,
		},
	}

	factory, err := CreateTraceStorageFactory(
		context.Background(),
		"memory-test",
		backend,
		getTelemetrySettings(),
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, factory)
	t.Cleanup(func() {
		if closer, ok := factory.(io.Closer); ok {
			require.NoError(t, closer.Close())
		}
	})
}

func TestCreateTraceStorageFactory_Elasticsearch(t *testing.T) {
	server := setupMockServer(t, getVersionResponse(t), http.StatusOK)
	backend := TraceBackend{
		Elasticsearch: &escfg.Configuration{
			Servers:  []string{server.URL},
			LogLevel: "error",
		},
	}

	factory, err := CreateTraceStorageFactory(
		context.Background(),
		"es-test",
		backend,
		getTelemetrySettings(),
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, factory)
	t.Cleanup(func() {
		if closer, ok := factory.(io.Closer); ok {
			require.NoError(t, closer.Close())
		}
	})
}

func TestCreateTraceStorageFactory_ElasticsearchWithAuthResolver(t *testing.T) {
	server := setupMockServer(t, getVersionResponse(t), http.StatusOK)
	backend := TraceBackend{
		Elasticsearch: &escfg.Configuration{
			Servers:  []string{server.URL},
			LogLevel: "error",
		},
	}

	authResolver := func(_ escfg.Authentication, _, _ string) (extensionauth.HTTPClient, error) {
		return nil, nil // No auth needed for this test
	}

	factory, err := CreateTraceStorageFactory(
		context.Background(),
		"es-test",
		backend,
		getTelemetrySettings(),
		authResolver,
	)

	require.NoError(t, err)
	require.NotNil(t, factory)
	t.Cleanup(func() {
		if closer, ok := factory.(io.Closer); ok {
			require.NoError(t, closer.Close())
		}
	})
}

func TestCreateTraceStorageFactory_ElasticsearchAuthResolverError(t *testing.T) {
	server := setupMockServer(t, getVersionResponse(t), http.StatusOK)
	backend := TraceBackend{
		Elasticsearch: &escfg.Configuration{
			Servers:  []string{server.URL},
			LogLevel: "error",
		},
	}

	authResolver := func(_ escfg.Authentication, _, _ string) (extensionauth.HTTPClient, error) {
		return nil, errors.New("auth error")
	}

	_, err := CreateTraceStorageFactory(
		context.Background(),
		"es-test",
		backend,
		getTelemetrySettings(),
		authResolver,
	)

	require.Error(t, err)
	require.Contains(t, err.Error(), "auth error")
}

func TestCreateTraceStorageFactory_EmptyBackend(t *testing.T) {
	backend := TraceBackend{}

	_, err := CreateTraceStorageFactory(
		context.Background(),
		"empty-test",
		backend,
		getTelemetrySettings(),
		nil,
	)

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to initialize storage 'empty-test'")
	require.Contains(t, err.Error(), "empty configuration")
}
