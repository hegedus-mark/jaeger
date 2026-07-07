// Copyright (c) 2025 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

package elasticsearch

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"

	"go.opentelemetry.io/collector/config/configoptional"
	"go.opentelemetry.io/collector/extension/extensionauth"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"github.com/jaegertracing/jaeger/internal/fswatcher"
	"github.com/jaegertracing/jaeger/internal/metrics"
	es "github.com/jaegertracing/jaeger/internal/storage/elasticsearch"
	escfg "github.com/jaegertracing/jaeger/internal/storage/elasticsearch/config"
	"github.com/jaegertracing/jaeger/internal/storage/elasticsearch/mappings"
	"github.com/jaegertracing/jaeger/internal/storage/v2/api/depstore"
	"github.com/jaegertracing/jaeger/internal/storage/v2/api/tracestore"
	"github.com/jaegertracing/jaeger/internal/storage/v2/api/tracestore/tracestoremetrics"
	v2depstore "github.com/jaegertracing/jaeger/internal/storage/v2/elasticsearch/depstore"
	v2tracestore "github.com/jaegertracing/jaeger/internal/storage/v2/elasticsearch/tracestore"
	esspanstore "github.com/jaegertracing/jaeger/internal/storage/v2/elasticsearch/tracestore/core"
	"github.com/jaegertracing/jaeger/internal/telemetry"
)

const tagError = "error"

var (
	_ io.Closer          = (*Factory)(nil)
	_ tracestore.Factory = (*Factory)(nil)
	_ depstore.Factory   = (*Factory)(nil)
)

type Factory struct {
	config          escfg.Configuration
	metricsFactory  metrics.Factory
	logger          *zap.Logger
	tracer          trace.TracerProvider
	templateBuilder es.TemplateBuilder
	client          atomic.Pointer[es.Client]
	pwdFileWatcher  *fswatcher.FSWatcher
	tags            []string
}

func NewFactory(ctx context.Context, cfg escfg.Configuration, telset telemetry.Settings, httpAuth extensionauth.HTTPClient) (*Factory, error) {
	// Ensure required fields are always included in tagsAsFields
	cfg = ensureRequiredFields(cfg)

	f := &Factory{
		config:          cfg,
		metricsFactory:  telset.Metrics,
		logger:          telset.Logger,
		tracer:          telset.TracerProvider,
		templateBuilder: es.TextTemplateBuilder{},
	}

	tags, err := f.config.TagKeysAsFields()
	if err != nil {
		return nil, err
	}
	f.tags = tags

	client, err := escfg.NewClient(ctx, &f.config, f.logger, f.metricsFactory, httpAuth)
	if err != nil {
		return nil, fmt.Errorf("failed to create Elasticsearch client: %w", err)
	}
	f.client.Store(&client)

	if f.config.Authentication.BasicAuthentication.HasValue() {
		if file := f.config.Authentication.BasicAuthentication.Get().PasswordFilePath; file != "" {
			watcher, err := fswatcher.New([]string{file}, f.onPasswordChange, f.logger)
			if err != nil {
				return nil, fmt.Errorf("failed to create watcher for ES client's password: %w", err)
			}
			f.pwdFileWatcher = watcher
		}
	}

	err = f.createTemplates(ctx)
	if err != nil {
		return nil, err
	}

	return f, nil
}

func (f *Factory) getClient() es.Client {
	if c := f.client.Load(); c != nil {
		return *c
	}
	return nil
}

func (f *Factory) CreateTraceReader() (tracestore.Reader, error) {
	params := esspanstore.SpanReaderParams{
		Client:              f.getClient,
		MaxDocCount:         f.config.MaxDocCount,
		MaxSpanAge:          f.config.MaxSpanAge,
		IndexPrefix:         f.config.Indices.IndexPrefix,
		SpanIndex:           f.config.Indices.Spans,
		ServiceIndex:        f.config.Indices.Services,
		TagDotReplacement:   f.config.Tags.DotReplacement,
		UseReadWriteAliases: f.config.UseReadWriteAliases,
		ReadAliasSuffix:     f.config.ReadAliasSuffix,
		RemoteReadClusters:  f.config.RemoteReadClusters,
		SpanReadAlias:       f.config.SpanReadAlias,
		ServiceReadAlias:    f.config.ServiceReadAlias,
		Logger:              f.logger,
		Tracer:              f.tracer.Tracer("esspanstore.SpanReader"),
	}
	return tracestoremetrics.NewReaderDecorator(v2tracestore.NewTraceReader(params), f.metricsFactory), nil
}

func (f *Factory) CreateTraceWriter() (tracestore.Writer, error) {
	params := esspanstore.SpanWriterParams{
		Client:              f.getClient,
		IndexPrefix:         f.config.Indices.IndexPrefix,
		SpanIndex:           f.config.Indices.Spans,
		ServiceIndex:        f.config.Indices.Services,
		AllTagsAsFields:     f.config.Tags.AllAsFields,
		TagKeysAsFields:     f.tags,
		TagDotReplacement:   f.config.Tags.DotReplacement,
		UseReadWriteAliases: f.config.UseReadWriteAliases,
		WriteAliasSuffix:    f.config.WriteAliasSuffix,
		SpanWriteAlias:      f.config.SpanWriteAlias,
		ServiceWriteAlias:   f.config.ServiceWriteAlias,
		Logger:              f.logger,
		MetricsFactory:      f.metricsFactory,
		ServiceCacheTTL:     f.config.ServiceCacheTTL,
	}
	wr := v2tracestore.NewTraceWriter(params)
	return wr, nil
}

func (f *Factory) CreateDependencyReader() (depstore.Reader, error) {
	params := v2depstore.Params{
		Client:              f.getClient,
		Logger:              f.logger,
		IndexPrefix:         f.config.Indices.IndexPrefix,
		IndexDateLayout:     f.config.Indices.Dependencies.DateLayout,
		MaxDocCount:         f.config.MaxDocCount,
		UseReadWriteAliases: f.config.UseReadWriteAliases,
	}
	return v2depstore.NewDependencyStoreV2(params), nil
}

func (f *Factory) Close() error {
	var errs []error
	if f.pwdFileWatcher != nil {
		errs = append(errs, f.pwdFileWatcher.Close())
	}
	if client := f.getClient(); client != nil {
		errs = append(errs, client.Close())
	}
	return errors.Join(errs...)
}

func (f *Factory) Purge(ctx context.Context) error {
	_, err := f.getClient().DeleteIndex("*").Do(ctx)
	return err
}

func (f *Factory) onPasswordChange() {
	basicAuth := f.config.Authentication.BasicAuthentication.Get()
	newPassword, err := loadTokenFromFile(basicAuth.PasswordFilePath)
	if err != nil {
		f.logger.Error("failed to reload password for Elasticsearch client", zap.Error(err))
		return
	}
	f.logger.Sugar().Infof("loaded new password of length %d from file", len(newPassword))
	newCfg := f.config // copy by value
	newCfg.Authentication.BasicAuthentication = configoptional.Some(escfg.BasicAuthentication{
		Username:         basicAuth.Username,
		Password:         newPassword,
		PasswordFilePath: "", // avoid error that both are set
	})

	newClient, err := escfg.NewClient(context.Background(), &newCfg, f.logger, f.metricsFactory, nil)
	if err != nil {
		f.logger.Error("failed to recreate Elasticsearch client with new password", zap.Error(err))
		return
	}
	if oldClient := *f.client.Swap(&newClient); oldClient != nil {
		if err := oldClient.Close(); err != nil {
			f.logger.Error("failed to close Elasticsearch client", zap.Error(err))
		}
	}
}

func loadTokenFromFile(path string) (string, error) {
	b, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return "", err
	}
	return strings.TrimRight(string(b), "\r\n"), nil
}

func (f *Factory) createTemplates(ctx context.Context) error {
	if f.config.CreateIndexTemplates {
		mappingBuilder := mappings.MappingBuilder{
			TemplateBuilder: f.templateBuilder,
			Indices:         f.config.Indices,
			EsVersion:       f.config.Version,
			UseILM:          f.config.UseILM,
		}
		spanMapping, serviceMapping, err := mappingBuilder.GetSpanServiceMappings()
		if err != nil {
			return err
		}
		jaegerSpanIdx := f.config.Indices.IndexPrefix.Apply("jaeger-span")
		jaegerServiceIdx := f.config.Indices.IndexPrefix.Apply("jaeger-service")
		_, err = f.getClient().CreateTemplate(jaegerSpanIdx).Body(spanMapping).Do(ctx)
		if err != nil {
			return fmt.Errorf("failed to create template %q: %w", jaegerSpanIdx, err)
		}
		_, err = f.getClient().CreateTemplate(jaegerServiceIdx).Body(serviceMapping).Do(ctx)
		if err != nil {
			return fmt.Errorf("failed to create template %q: %w", jaegerServiceIdx, err)
		}
	}
	return nil
}

// ensureRequiredFields adds span.kind and span.status error to tags-as-fields configuration
// regardless of user settings
func ensureRequiredFields(cfg escfg.Configuration) escfg.Configuration {
	if cfg.Tags.AllAsFields {
		return cfg
	}

	// Return new configuration with updated includes
	if cfg.Tags.Include != "" && !strings.HasSuffix(cfg.Tags.Include, ",") {
		cfg.Tags.Include += ","
	}
	cfg.Tags.Include += "span.kind,error"

	return cfg
}
