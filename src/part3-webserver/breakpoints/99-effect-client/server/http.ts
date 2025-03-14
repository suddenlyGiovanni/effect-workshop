import {
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  type HttpServerError,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { type ConfigError, Effect, Layer, pipe } from "effect";

import * as C from "../shared/config.ts";
import * as M from "./model.ts";
import { NodeServer } from "./node.ts";
import { type ConnectionStore, getAvailableColors } from "./shared.ts";

export const HTTPServerLive: Layer.Layer<
  HttpServer.HttpServer,
  ConfigError.ConfigError | HttpServerError.ServeError,
  NodeServer
> = Layer.scoped(
  HttpServer.HttpServer,
  NodeServer.pipe(
    Effect.zip(C.PORT),

    Effect.flatMap(([server, port]) =>
      NodeHttpServer.make(() => server, { port })
    )
  )
);

export const HttpLive: Layer.Layer<
  never,
  never,
  HttpServer.HttpServer | ConnectionStore
> = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/colors",
    Effect.flatMap(getAvailableColors, (colors) =>
      pipe(
        M.AvailableColorsResponse.make({ _tag: "availableColors", colors }),

        HttpServerResponse.schemaJson(M.AvailableColorsResponse)
      )
    )
  ),
  HttpServer.serve(HttpMiddleware.logger)
);
