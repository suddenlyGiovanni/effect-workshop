import {
  Chunk,
  Console,
  Context,
  Effect,
  Either,
  HashMap,
  Layer,
  Option,
  PubSub,
  Queue,
  Ref,
  Schedule,
  Schema,
  Stream,
  pipe,
} from "effect";
import { type WebSocket, WebSocketServer } from "ws";

import * as M from "./model.ts";
import { NodeServer } from "./node.ts";
import { ConnectionStore, getAvailableColors } from "./shared.ts";

export class MessagePubSub extends Context.Tag("MessagePubSub")<
  MessagePubSub,
  M.MessagePubSub
>() {
  public static readonly Live: Layer.Layer<MessagePubSub, never, never> =
    Layer.effect(MessagePubSub, PubSub.unbounded<M.ServerOutgoingMessage>());
}

function registerConnection(
  ws: WebSocket
): Effect.Effect<void, never, MessagePubSub | ConnectionStore> {
  return Effect.gen(function* () {
    const setupInfo = yield* Effect.async<
      M.StartupMessage,
      M.BadStartupMessageError,
      ConnectionStore
    >((emit) => {
      ws.once("message", (message) =>
        pipe(
          message.toString(),

          Schema.decodeUnknown(M.StartupMessageFromJSON),

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
                  error: {
                    _tag: "colorAlreadyTaken",
                    color: message.color,
                  },
                });
              }
              return message;
            })
          ),

          emit
        )
      );
    });

    yield* Effect.logDebug(`New connection from ${setupInfo.name}`);

    const messagesStream = Stream.async<
      M.ServerIncomingMessage,
      M.UnknownIncomingMessageError | M.WebSocketError
    >((emit) => {
      ws.on("message", (message) => {
        const messageString = message.toString();

        pipe(
          messageString,

          Schema.decodeUnknown(M.ServerIncomingMessageFromJSON),

          Effect.mapError(
            (parseError) =>
              new M.UnknownIncomingMessageError({
                parseError,
                rawMessage: messageString,
              })
          ),

          Effect.mapBoth({
            onSuccess: (message) => Chunk.make(message),
            onFailure: (error) => Option.some(error),
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
        Effect.logDebug(`FROM: ${setupInfo.name}: ${JSON.stringify(message)}`)
      ),

      Stream.onError((error) =>
        Effect.logError(`FROM: ${setupInfo.name}: ${JSON.stringify(error)}`)
      ),

      Stream.either,

      Stream.filter(Either.isRight),

      Stream.map((either) => either.right)
    );

    const sendQueue = yield* Queue.unbounded<M.ServerOutgoingMessage>();

    const { sendFiber, receiveFiber } = yield* Effect.gen(function* () {
      const messagePubSub = yield* MessagePubSub;

      // this fiber finishes when the connection is closed and the stream ends
      const receiveFiber = yield* pipe(
        messagesStream,

        Stream.tap((message) =>
          PubSub.publish(messagePubSub, {
            _tag: "message",
            name: setupInfo.name,
            color: setupInfo.color,
            message: message.message,
            timestamp: Date.now(),
          })
        ),

        Stream.ensuring(
          Effect.zip(
            PubSub.publish(messagePubSub, {
              _tag: "leave",
              name: setupInfo.name,
              color: setupInfo.color,
            }),
            Effect.gen(function* () {
              const connectionStore = yield* ConnectionStore;
              yield* Ref.update(connectionStore, (store) =>
                HashMap.remove(store, setupInfo.name)
              );
            })
          )
        ),

        Stream.runDrain,

        Effect.fork
      );

      // this fiber finishes when the connection is closed and the stream ends
      const sendFiber = yield* pipe(
        Stream.fromPubSub(messagePubSub),

        Stream.tap((message) =>
          Effect.logDebug(`TO: ${setupInfo.name}: ${JSON.stringify(message)}`)
        ),

        Stream.tap((message) =>
          pipe(
            Schema.encode(M.ServerOutgoingMessageFromJSON)(message),
            Effect.flatMap((messageString) =>
              Effect.sync(() => ws.send(messageString))
            )
          )
        ),

        Stream.catchAll((error) => Effect.logError(error)),

        Stream.runDrain,

        Effect.zipLeft(
          pipe(
            Queue.take(sendQueue),
            Effect.flatMap((message) =>
              Schema.encode(M.ServerOutgoingMessageFromJSON)(message)
            ),
            Effect.flatMap((messageString) =>
              Effect.sync(() => ws.send(messageString))
            ),
            Effect.catchAll((error) => Effect.logError(error)),
            Effect.forever
          ),
          { concurrent: true }
        ),

        Effect.fork
      );

      // so other fibers can run
      yield* Effect.yieldNow();

      yield* PubSub.publish(messagePubSub, {
        _tag: "join",
        name: setupInfo.name,
        color: setupInfo.color,
      });

      return { sendFiber, receiveFiber };
    });

    const close = Effect.sync(() => ws.close());

    const connection: M.ServerWebSocketConnection = {
      _rawWS: ws,
      name: setupInfo.name,
      color: setupInfo.color,
      timeConnected: Date.now(),
      messages: messagesStream,
      send: sendQueue,
      sendFiber,
      receiveFiber,
      close,
    };

    const connectionStore = yield* ConnectionStore;

    yield* Ref.update(connectionStore, (store) =>
      HashMap.set(store, setupInfo.name, connection)
    );
  }).pipe(Effect.catchAll((error) => Console.error(error)));
}

export class WSSServer extends Context.Tag("WSSServer")<
  WSSServer,
  WebSocketServer
>() {
  public static readonly Live: Layer.Layer<WSSServer, never, NodeServer> =
    Layer.effect(
      WSSServer,
      NodeServer.pipe(Effect.map((server) => new WebSocketServer({ server })))
    );
}

export const WebSocketLive: Layer.Layer<
  never,
  never,
  ConnectionStore | WSSServer
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const wss = yield* WSSServer;

    const connectionStream = Stream.async<WebSocket>((emit) => {
      wss.on("connection", (ws) => emit(Effect.succeed(Chunk.make(ws))));
    });

    /**
     * This fiber lives for the duration of the program
     */
    yield* pipe(
      connectionStream,

      Stream.tap((ws) => registerConnection(ws)),

      Stream.runDrain,

      Effect.forkDaemon
    );

    /**
     * This fiber lives for the duration of the program
     */
    const pubsub = yield* MessagePubSub;

    yield* pipe(
      Stream.fromPubSub(pubsub),

      Stream.tap((message) =>
        Console.info(`BROADCASTING: ${JSON.stringify(message)}`)
      ),

      Stream.runDrain,

      Effect.forkDaemon
    );

    /**
     * This fiber lives for the duration of the program
     */
    yield* pipe(
      Effect.gen(function* () {
        const connectionStore = yield* ConnectionStore;

        const connections = yield* Ref.get(connectionStore);

        yield* Console.log(`Current Connections: ${HashMap.size(connections)}`);

        for (const connection of HashMap.values(connections)) {
          yield* Console.log(
            `${connection.name} connected for ${Date.now() - connection.timeConnected}ms`
          );
        }
      }),

      Effect.repeat(Schedule.spaced("1 seconds")),

      Effect.forkDaemon
    );
  })
).pipe(Layer.provide(MessagePubSub.Live));
