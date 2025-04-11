import { createServer } from "node:http";
import { type ConfigError, Context, Effect, HashMap, Layer, Ref } from "effect";
import { WebSocketServer } from "ws";

import * as C from "./config.ts";
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
  Ref.Ref<HashMap.HashMap<string, M.WebSocketConnection>>
>() {
  static readonly Live = Layer.effect(
    CurrentConnections,
    Ref.make(HashMap.empty<string, M.WebSocketConnection>())
  );
}

export const ListenLive: Layer.Layer<
  never,
  ConfigError.ConfigError,
  CurrentConnections | HttpServer
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const port = yield* C.PORT;

    const server = yield* HttpServer;

    const currentConnections = yield* CurrentConnections;

    const connections = yield* Ref.get(currentConnections);

    yield* Effect.sync(() =>
      server.listen(port, () => console.log("Server started on port", port))
    );

    yield* Effect.sync(() =>
      setInterval(
        () => console.log("Current connections:", HashMap.size(connections)),
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

  const connections = yield* Ref.get(currentConnections);

  const usedColors = Array.from(HashMap.values(connections)).map(
    (_) => _.color
  );

  return M.colors.filter((color) => !usedColors.includes(color));
});
