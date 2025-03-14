import {
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  type HttpServerError,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { type ConfigError, Effect, Layer, pipe } from "effect";

import * as C from "./config.ts";
import * as M from "./model.ts";
import {
  type CurrentConnections,
  HttpServer as _HttpServer,
  getAvailableColors,
} from "./shared.ts";

export const HTTPServerLive: Layer.Layer<
  HttpServer.HttpServer,
  ConfigError.ConfigError | HttpServerError.ServeError,
  _HttpServer
> = Layer.scoped(
  HttpServer.HttpServer,
  _HttpServer.pipe(
    Effect.zip(C.PORT),
    Effect.flatMap(([server, port]) =>
      NodeHttpServer.make(() => server, { port })
    )
  )
).pipe(HttpServer.withLogAddress);

export const Live: Layer.Layer<
  never,
  never,
  HttpServer.HttpServer | CurrentConnections
> = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/colors",
    Effect.gen(function* () {
      const availableColors = yield* getAvailableColors;

      return yield* pipe(
        M.AvailableColorsResponse.make({
          _tag: "availableColors",
          colors: availableColors,
        }),
        HttpServerResponse.schemaJson(M.AvailableColorsResponse)
      );
    })
  ),
  HttpServer.serve(HttpMiddleware.logger)
);
