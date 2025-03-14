import {
  Chunk,
  Context,
  Effect,
  Either,
  Layer,
  Option,
  Queue,
  Schema,
  Stream,
  pipe,
} from "effect";
import WebSocket from "ws";

import * as C from "../shared/config.ts";
import * as M from "./model.ts";

export class WebSocketConnection extends Context.Tag("WebSocketConnection")<
  WebSocketConnection,
  M.ClientWebSocketConnection
>() {
  public static readonly Live = (name: string, color: M.Color) =>
    Layer.effect(
      WebSocketConnection,
      Effect.gen(function* () {
        const port = yield* C.PORT;

        const host = yield* C.HOST;

        const ws = yield* Effect.sync(
          () => new WebSocket(`ws://${host}:${port}`)
        );

        yield* Effect.async<void, M.WebSocketError>((emit) => {
          ws.on("open", () => emit(Effect.succeed(undefined)));

          ws.on("error", (error) =>
            emit(Effect.fail(new M.WebSocketError({ error })))
          );
        });

        yield* pipe(
          M.StartupMessage.make({ _tag: "startup", color, name }),

          Schema.encode(M.StartupMessageFromJSON),

          Effect.flatMap((message) => Effect.sync(() => ws.send(message))),

          Effect.mapError(
            (parseError) =>
              new M.BadStartupMessageError({
                error: { _tag: "parseError", parseError },
              })
          )
        );

        const messagesStream = Stream.async<
          M.ClientIncomingMessage,
          M.UnknownIncomingMessageError | M.WebSocketError
        >((emit) => {
          ws.on("message", (message) => {
            const messageString = message.toString();

            console.log(messageString);

            pipe(
              messageString,

              Schema.decodeUnknownEither(M.ClientIncomingMessageFromJSON),

              Either.mapLeft(
                (parseError) =>
                  new M.UnknownIncomingMessageError({
                    parseError,
                    rawMessage: messageString,
                  })
              ),

              Either.mapBoth({
                onRight: (message) => Chunk.make(message),
                onLeft: (error) => Option.some(error),
              }),

              emit
            );
          });

          ws.on("error", (error) =>
            emit(Effect.fail(Option.some(new M.WebSocketError({ error }))))
          );

          ws.on("close", () => emit(Effect.fail(Option.none())));
        }).pipe(
          Stream.tap((message) =>
            Effect.logDebug(`MESSAGE RECEIVED: ${JSON.stringify(message)}`)
          ),

          Stream.onError((error) =>
            Effect.logError(`ERROR: ${JSON.stringify(error)}`)
          ),

          Stream.either,

          Stream.filter(Either.isRight),

          Stream.map((either) => either.right)
        );

        const sendQueue = yield* Queue.unbounded<M.ClientOutgoingMessage>();

        const sendFiber = yield* pipe(
          Queue.take(sendQueue),

          Effect.flatMap((message) =>
            pipe(message, Schema.encode(M.ClientOutgoingMessageFromJSON))
          ),

          Effect.flatMap((messageString) =>
            Effect.sync(() => ws.send(messageString))
          ),

          Effect.catchAll((error) => Effect.logError(error)),

          Effect.forever,

          Effect.forkDaemon
        );

        const close = Effect.sync(() => ws.close());

        const connection: M.ClientWebSocketConnection = {
          _rawWS: ws,
          name,
          color,
          timeConnected: Date.now(),
          messages: messagesStream,
          send: sendQueue,
          sendFiber,
          close,
        };

        return connection;
      })
    );
}
