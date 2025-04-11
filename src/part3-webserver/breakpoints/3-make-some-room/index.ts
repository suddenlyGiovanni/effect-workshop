import { BunRuntime } from "@effect/platform-bun";
import { Layer, pipe } from "effect";

import * as HTTP from "./http.ts";
import * as SERVER from "./shared.ts";
import * as WS from "./ws.ts";

const serversLayer: Layer.Layer<
  never,
  never,
  SERVER.HttpServer | SERVER.CurrentConnections | SERVER.WSSServer
> = Layer.merge(HTTP.Live, WS.Live);

pipe(
  Layer.merge(serversLayer, SERVER.ListenLive),
  Layer.provide(SERVER.WSSServer.Live),
  Layer.provide(SERVER.HttpServer.Live),
  Layer.provide(SERVER.CurrentConnections.Live),
  Layer.launch,
  BunRuntime.runMain
);
