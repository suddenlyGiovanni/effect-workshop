import { createServer } from "node:http";
import { Config, type ConfigError, Context, Effect, Layer } from "effect";
import { WebSocketServer } from "ws";

import * as M from "./model.ts";

export class HttpServer extends Context.Tag("HttpServer")<
  HttpServer,
  ReturnType<typeof createServer>
>() {
  static readonly Live = Layer.sync(HttpServer, createServer);
}

export class WSSServer extends Context.Tag("WSSServer")<
  WSSServer,
  WebSocketServer
>() {
  static readonly Live = Layer.effect(
    WSSServer,
    HttpServer.pipe(Effect.map((server) => new WebSocketServer({ server })))
  );
}

export class CurrentConnections extends Context.Tag("CurrentConnections")<
  CurrentConnections,
  Map<string, M.WebSocketConnection>
>() {
  static readonly Live = Layer.sync(CurrentConnections, () => new Map());
}

export const ListenLive: Layer.Layer<
  never,
  ConfigError.ConfigError,
  HttpServer | CurrentConnections
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const port = yield* Config.integer("PORT").pipe(Config.withDefault(3000));

    const server = yield* HttpServer;

    const currentConnections = yield* CurrentConnections;

    yield* Effect.sync(() =>
      server.listen(port, () => console.log("Server started on port", port))
    );

    yield* Effect.sync(() =>
      setInterval(
        () => console.log("Current connections:", currentConnections.size),
        1000
      )
    );
  })
);

export const getAvailableColors: Effect.Effect<
  M.Color[],
  never,
  CurrentConnections
> = Effect.gen(function* () {
  const currentConnections = yield* CurrentConnections;

  const currentColors = Array.from(currentConnections.values()).map(
    (conn) => conn.color
  );

  const availableColors = M.colors.filter(
    (color) => !currentColors.includes(color)
  );

  return availableColors;
});
