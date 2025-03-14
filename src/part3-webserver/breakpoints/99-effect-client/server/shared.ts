import { Context, Effect, HashMap, Layer, Ref, pipe } from "effect";

import * as M from "./model.ts";

export class ConnectionStore extends Context.Tag("ConnectionStore")<
  ConnectionStore,
  M.ConnectionStore
>() {
  public static readonly Live = Layer.effect(
    ConnectionStore,
    Ref.make(HashMap.empty<string, M.ServerWebSocketConnection>())
  );
}

export const getAvailableColors: Effect.Effect<
  M.Color[],
  never,
  ConnectionStore
> = pipe(
  ConnectionStore,
  Effect.flatMap((store) => Ref.get(store)),
  Effect.map((connectionsMap) => {
    const usedColors = Array.from(HashMap.values(connectionsMap)).map(
      (_) => _.color
    );
    return M.colors.filter((color) => !usedColors.includes(color));
  })
);
