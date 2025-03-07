/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import Boom from '@hapi/boom';
import { RequestHandler } from '@kbn/core-http-server';
import { KibanaRequest, RouteRegistrar } from '@kbn/core/server';
import { jsonRt, mergeRt } from '@kbn/io-ts-utils';
import { InspectResponse } from '@kbn/observability-plugin/typings/common';
import {
  decodeRequestParams,
  parseEndpoint,
  routeValidationObject,
  ServerRouteRepository,
} from '@kbn/server-route-repository';
import agent from 'elastic-apm-node';
import * as t from 'io-ts';
import { merge } from 'lodash';
import { inspectCpuProfile } from '@kbn/adhoc-profiler';
import { pickKeys } from '../../../common/utils/pick_keys';
import type { ApmPluginRequestHandlerContext } from '../typings';
import { APMRouteHandlerResources, TelemetryUsageCounter } from '../typings';

const inspectRt = t.exact(
  t.partial({
    query: t.exact(t.partial({ _inspect: jsonRt.pipe(t.boolean) })),
  })
);

const CLIENT_CLOSED_REQUEST = {
  statusCode: 499,
  body: {
    message: 'Client closed request',
  },
};

export const inspectableEsQueriesMap = new WeakMap<
  KibanaRequest,
  InspectResponse
>();

export function registerRoutes({
  core,
  repository,
  plugins,
  logger,
  config,
  ruleDataClient,
  telemetryUsageCounter,
  kibanaVersion,
}: {
  core: APMRouteHandlerResources['core'];
  plugins: APMRouteHandlerResources['plugins'];
  logger: APMRouteHandlerResources['logger'];
  repository: ServerRouteRepository;
  config: APMRouteHandlerResources['config'];
  ruleDataClient: APMRouteHandlerResources['ruleDataClient'];
  telemetryUsageCounter?: TelemetryUsageCounter;
  kibanaVersion: string;
}) {
  const routes = Object.values(repository);

  const router = core.setup.http.createRouter();

  function wrapRouteHandlerInProfiler(
    handler: RequestHandler<
      unknown,
      unknown,
      unknown,
      ApmPluginRequestHandlerContext
    >
  ): RequestHandler<
    unknown,
    { _profile?: 'inspect' },
    unknown,
    ApmPluginRequestHandlerContext
  > {
    return (context, request, response) => {
      const { _profile } = request.query;
      if (_profile === 'inspect') {
        delete request.query._profile;
        return inspectCpuProfile(() => handler(context, request, response));
      }
      return handler(context, request, response);
    };
  }

  routes.forEach((route) => {
    const { params, endpoint, options, handler } = route;

    const { method, pathname } = parseEndpoint(endpoint);

    (
      router[method] as RouteRegistrar<
        typeof method,
        ApmPluginRequestHandlerContext
      >
    )(
      {
        path: pathname,
        options,
        validate: routeValidationObject,
      },
      wrapRouteHandlerInProfiler(async (context, request, response) => {
        if (agent.isStarted()) {
          agent.addLabels({
            plugin: 'apm',
          });
        }

        // init debug queries
        inspectableEsQueriesMap.set(request, []);

        try {
          const runtimeType = params ? mergeRt(params, inspectRt) : inspectRt;

          const validatedParams = decodeRequestParams(
            pickKeys(request, 'params', 'body', 'query'),
            runtimeType
          );

          const { aborted, data } = await Promise.race([
            handler({
              request,
              context,
              config,
              logger,
              core,
              plugins,
              telemetryUsageCounter,
              params: merge(
                {
                  query: {
                    _inspect: false,
                  },
                },
                validatedParams
              ),
              ruleDataClient,
              kibanaVersion,
            }).then((value: Record<string, any> | undefined | null) => {
              return {
                aborted: false,
                data: value,
              };
            }),
            request.events.aborted$.toPromise().then(() => {
              return {
                aborted: true,
                data: undefined,
              };
            }),
          ]);

          if (aborted) {
            return response.custom(CLIENT_CLOSED_REQUEST);
          }

          if (Array.isArray(data)) {
            throw new Error('Return type cannot be an array');
          }

          const body = validatedParams.query?._inspect
            ? {
                ...data,
                _inspect: inspectableEsQueriesMap.get(request),
              }
            : { ...data };

          if (!options.disableTelemetry && telemetryUsageCounter) {
            telemetryUsageCounter.incrementCounter({
              counterName: `${method.toUpperCase()} ${pathname}`,
              counterType: 'success',
            });
          }

          return response.ok({ body });
        } catch (error) {
          logger.error(error);

          if (!options.disableTelemetry && telemetryUsageCounter) {
            telemetryUsageCounter.incrementCounter({
              counterName: `${method.toUpperCase()} ${pathname}`,
              counterType: 'error',
            });
          }
          const opts = {
            statusCode: 500,
            body: {
              message: error.message,
              attributes: {
                _inspect: inspectableEsQueriesMap.get(request),
              },
            },
          };

          if (error instanceof errors.RequestAbortedError) {
            return response.custom(merge(opts, CLIENT_CLOSED_REQUEST));
          }

          if (Boom.isBoom(error)) {
            opts.statusCode = error.output.statusCode;
          }

          return response.custom(opts);
        } finally {
          // cleanup
          inspectableEsQueriesMap.delete(request);
        }
      })
    );
  });
}
