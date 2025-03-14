import {
  Chunk,
  Console,
  Effect,
  Fiber,
  FiberSet,
  HashMap,
  Layer,
  Option,
  type ParseResult,
  PubSub,
  Queue,
  Ref,
  Schedule,
  Schema,
  type Scope,
  Stream,
  pipe,
} from "effect";
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
  sendToWsQueue: Queue.Dequeue<M.ServerOutgoingMessage>,
  broadcastQueue: Queue.Enqueue<M.ServerOutgoingMessage>
): Effect.Effect<
  void,
  | ParseResult.ParseError
  | M.BadStartupMessageError
  | M.UnknownIncomingMessageError,
  CurrentConnections | Scope.Scope
> =>
  Effect.gen(function* () {
    console.log("Initializing connection");
    const currentConnectionsRef = yield* CurrentConnections;

    const { color, name } = yield* pipe(
      Effect.async<M.StartupMessage, ParseResult.ParseError>((emit) => {
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
              error: {
                _tag: "colorAlreadyTaken",
                color: message.color,
              },
            });
          }

          return message;
        })
      )
    );

    yield* Console.log(`New connection: ${name} (${color})`);

    yield* Queue.offer(broadcastQueue, { _tag: "join", name, color });

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
      )
    );

    const messagesWithInfoStream = parsedMessagesStream.pipe(
      Stream.map((message) => ({
        ...message,
        name,
        color,
        timestamp: Date.now(),
      })),

      Stream.concat(Stream.make({ _tag: "leave", name, color } as const)),

      Stream.tapError((err) => Console.error(err))
    );

    const broadcastFiber = yield* pipe(
      Stream.runForEach(messagesWithInfoStream, (message) =>
        Queue.offer(broadcastQueue, message)
      ),
      Effect.fork
    );

    const manualSendQueue = yield* Queue.unbounded<M.ServerOutgoingMessage>();

    const toSendStream = Stream.fromQueue(manualSendQueue).pipe(
      Stream.merge(Stream.fromQueue(sendToWsQueue))
    );

    const sendToWsFiber = yield* pipe(
      Stream.runForEach(toSendStream, (message) =>
        encodeMessage(message).pipe(Effect.andThen((msg) => ws.send(msg)))
      ),
      Effect.fork
    );

    const connection: M.WebSocketConnection = {
      _rawWS: ws,
      name,
      color,
      timeConnected: Date.now(),
      messages: parsedMessagesStream,
      sendQueue: manualSendQueue,
      close: Effect.sync(() => ws.close()),
    };

    yield* Effect.addFinalizer(() => connection.close);

    yield* Ref.update(currentConnectionsRef, (connections) =>
      HashMap.set(connections, name, connection)
    );

    yield* Fiber.join(Fiber.zip(broadcastFiber, sendToWsFiber));
  });

export const Live: Layer.Layer<
  never,
  Error,
  CurrentConnections | Scope.Scope | WSSServer
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const wss = yield* WSSServer;

    const currentConnectionsRef = yield* CurrentConnections;

    const fiberSet = yield* FiberSet.make<
      void,
      | M.UnknownIncomingMessageError
      | M.BadStartupMessageError
      | ParseResult.ParseError
    >();

    const pubsub = yield* PubSub.unbounded<M.ServerOutgoingMessage>();

    const connectionsStream = createConnectionsStream(wss);

    const initializeConnectionsFiber = yield* pipe(
      connectionsStream,
      Stream.runForEach((ws) =>
        Effect.gen(function* () {
          const subscription = yield* pubsub.subscribe;

          const fiber = yield* pipe(
            initializeConnection(ws, subscription, pubsub),
            Effect.fork
          );

          yield* FiberSet.add(fiberSet, fiber);
        })
      ),
      Effect.fork
    );

    const connectionLogFiber = yield* pipe(
      Effect.gen(function* () {
        const connections = yield* Ref.get(currentConnectionsRef);

        yield* Console.log(`Current connections: ${HashMap.size(connections)}`);

        for (const [name, connection] of HashMap.entries(connections)) {
          yield* Console.log(
            `Connection: ${name} (${connection.color}) - ${Math.floor(
              (Date.now() - connection.timeConnected) / 1000
            )}s`
          );
        }

        /**
         * forcefully sending a message to all clients
         */
        const message: M.ServerOutgoingMessage = {
          _tag: "message",
          name: "Server",
          color: "white",
          message: "THIS IS THE SERVER SPEAKING!",
          timestamp: Date.now(),
        };

        // yield* _(Queue.offer(pubsub, message));

        /**
         * just to one client
         * forcefully sending a message to all clients
         */
        const ethanMessage: M.ServerOutgoingMessage = {
          _tag: "message",
          name: "Server",
          color: "red",
          message: "*I know it's you Ethan!*",
          timestamp: Date.now(),
        };

        const randomConnection = HashMap.get(connections, "ethan");

        if (randomConnection._tag === "Some") {
          yield* Queue.offer(randomConnection.value.sendQueue, ethanMessage);
        }
      }),

      Effect.repeat(Schedule.spaced("1 seconds")),

      Effect.fork
    );

    yield* Fiber.join(
      Fiber.zip(initializeConnectionsFiber, connectionLogFiber)
    );
  })
);
