import {
  Chunk,
  Console,
  Effect,
  HashMap,
  Layer,
  Option,
  Ref,
  Schedule,
  Schema,
  Stream,
  pipe,
} from "effect";
import type { ParseError } from "effect/ParseResult";
import type { WebSocket, WebSocketServer } from "ws";

import * as M from "./model.ts";
import { CurrentConnections, WSSServer, getAvailableColors } from "./shared.ts";

const createConnectionsStream = (
  wss: WebSocketServer
): Stream.Stream<WebSocket, Error, never> =>
  Stream.async<WebSocket, Error>((emit) => {
    wss.on("connection", (ws: WebSocket) => emit(Effect.succeed(Chunk.of(ws))));

    wss.on("error", (err) => emit(Effect.fail(Option.some(err))));

    wss.on("close", () => emit(Effect.fail(Option.none())));
  }).pipe(Stream.tap(() => Console.log("New connection")));

const parseMessage = pipe(
  Schema.parseJson(M.ServerIncomingMessage),
  Schema.decode
);

const encodeMessage = pipe(
  Schema.parseJson(M.ServerOutgoingMessage),
  Schema.encode
);

const parseStartupMessage = pipe(
  Schema.parseJson(M.StartupMessage),
  Schema.decode
);

const initializeConnection = (
  ws: WebSocket,
  publish: (message: M.ServerOutgoingMessage) => Effect.Effect<void>
): Effect.Effect<
  void,
  M.BadStartupMessageError | M.UnknownIncomingMessageError,
  CurrentConnections
> =>
  Effect.gen(function* () {
    console.log("Initializing connection");
    const connectionsRef = yield* CurrentConnections;

    const { color, name } = yield* pipe(
      Effect.async<M.StartupMessage, ParseError>((emit) => {
        ws.once("message", (data) =>
          pipe(data.toString(), parseStartupMessage, emit)
        );
      }),

      Effect.mapError(
        (parseError) =>
          new M.BadStartupMessageError({
            error: { _tag: "parseError", parseError },
          })
      ),

      Effect.flatMap((message) =>
        Effect.gen(function* () {
          const availableColors = yield* getAvailableColors;

          if (!availableColors.includes(message.color)) {
            yield* new M.BadStartupMessageError({
              error: { _tag: "colorAlreadyTaken", color: message.color },
            });
          }

          return message;
        })
      )
    );

    yield* Console.log(`New connection: ${name} (${color})`);

    yield* publish({ _tag: "join", name, color });

    const connection: M.WebSocketConnection = {
      _rawWS: ws,
      name,
      color,
      timeConnected: Date.now(),
      send: (message) =>
        pipe(
          message,
          encodeMessage,
          Effect.andThen((msg) => Effect.sync(() => ws.send(msg)))
        ),
      close: Effect.sync(() => ws.close()),
    };

    yield* Ref.update(connectionsRef, (connections) =>
      HashMap.set(connections, name, connection)
    );

    const rawMessagesStream = Stream.async<string, Error>((emit) => {
      ws.on("message", (data) =>
        emit(Effect.succeed(Chunk.of(data.toString())))
      );

      ws.on("error", (err) => emit(Effect.fail(Option.some(err))));

      ws.on("close", () => emit(Effect.fail(Option.none())));
    });

    const parsedMessagesStream = pipe(
      rawMessagesStream,

      Stream.mapEffect(parseMessage),

      Stream.mapError(
        (parseError) => new M.UnknownIncomingMessageError({ parseError })
      ),

      Stream.map((message) => ({
        ...message,
        name,
        color,
        timestamp: Date.now(),
      })),

      Stream.concat(Stream.make({ _tag: "leave", name, color } as const)),

      Stream.tapError((err) => Console.error(err))
    );

    yield* Stream.runForEach(parsedMessagesStream, publish);
  });

export const Live: Layer.Layer<
  never,
  Error | M.BadStartupMessageError | M.UnknownIncomingMessageError,
  CurrentConnections | WSSServer
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const wss = yield* WSSServer;

    const currentConnectionsRef = yield* CurrentConnections;

    const publish = (message: M.ServerOutgoingMessage) =>
      Effect.gen(function* () {
        console.log("Publishing message", message);

        const connections = yield* Ref.get(currentConnectionsRef);

        yield* Effect.forEach(HashMap.values(connections), (conn) =>
          conn.send(message)
        );
      }).pipe(
        Effect.catchAll((err) => Console.error(err)),
        Effect.asVoid
      );

    const connectionsStream = createConnectionsStream(wss).pipe(
      Stream.tapError((err) => Console.error(err))
    );

    yield* Stream.runForEach(connectionsStream, (ws) =>
      initializeConnection(ws, publish)
    );

    yield* pipe(
      Effect.gen(function* () {
        const connections = yield* Ref.get(currentConnectionsRef);
        yield* Console.log(`Current connections: ${HashMap.size(connections)}`);
      }),

      Effect.repeat(Schedule.spaced("1 seconds"))
    );
    // hmmmm why dont these work?
  })
);
