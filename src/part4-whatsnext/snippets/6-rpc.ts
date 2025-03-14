import { createServer } from "node:http";

import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  type HttpServerError,
} from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Rpc, RpcResolver, RpcRouter } from "@effect/rpc";
import { HttpRpcResolver, HttpRpcRouter } from "@effect/rpc-http";
import { Console, Effect, Layer, Schema, Stream } from "effect";

/**
 * `rpc` or "remote procedure call" is a way to call a function on a remote server;
 * It abstracts the network communication and makes it look like a local function call
 * all while remaining full type safe.
 * Effect provides its own rpc implementation.
 *
 * It starts by defining a schema for the client and server to use
 * - Requests can return a simple value, or a stream
 * - Requests are constructed with the form: tag, errorSchema, successSchema, inputs
 * 	these are all defined by schemas, instead of types because
 * 	the schemas are used to serialize and deserialize the data over the network
 */

/**
 * request.ts
 */
class Todo extends Schema.TaggedClass<Todo>()("Todo", {
  id: Schema.Number.pipe(Schema.int()),
  title: Schema.String,
  completed: Schema.Boolean,
}) {}

class GetTodoError extends Schema.TaggedError<GetTodoError>()(
  "GetTodoError",
  {}
) {}

class GetTodos extends Rpc.StreamRequest<GetTodos>()("GetTodos", {
  failure: GetTodoError,
  success: Todo,
  payload: {},
}) {}

class GetTodoById extends Schema.TaggedRequest<GetTodoById>()("GetTodoById", {
  failure: GetTodoError,
  success: Todo,
  payload: { id: Schema.Number.pipe(Schema.int()) },
}) {}

/**
 * # Defining a Router (e.g. `router.ts`)
 *
 * First, we make a `RpcRouter` using our Schema.
 */
const router: RpcRouter.RpcRouter<GetTodos | GetTodoById, never> =
  RpcRouter.make(
    Rpc.stream(GetTodos, () =>
      Stream.fromIterable(
        [1, 2, 3].map((id) => new Todo({ id, title: "todo", completed: false }))
      )
    ),
    Rpc.effect(GetTodoById, (getTodoById) =>
      getTodoById.id === 1
        ? Effect.succeed(
            new Todo({ id: getTodoById.id, title: "todo", completed: false })
          )
        : Effect.fail(new GetTodoError({}))
    )
  );

type Router = typeof router;

/**
 * # Serving the API (e.g. `server.ts`)
 *
 * Next well create our server;
 * You can implement the server in any way you want, but here we'll use the http router.
 */
export const HttpLive: Layer.Layer<never, HttpServerError.ServeError, never> =
  HttpRouter.empty.pipe(
    HttpRouter.post("/rpc", HttpRpcRouter.toHttpApp(router)),
    HttpServer.serve(HttpMiddleware.logger),
    HttpServer.withLogAddress,
    Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
  );

NodeRuntime.runMain(Layer.launch(HttpLive));

/**
 * # On the client side (e.g. `client.ts`)
 *
 * And finally we can create a client, again this can be done in any way you want,
 * but here we'll use the http client.
 */
const makeClient: Effect.Effect<
  <Req extends GetTodoById | GetTodos>(
    request: Req
  ) => Rpc.Rpc.Result<Req, never>,
  never,
  HttpClient.HttpClient
> = Effect.gen(function* () {
  const baseClient = yield* HttpClient.HttpClient;
  const client = baseClient.pipe(
    HttpClient.filterStatusOk,
    HttpClient.mapRequest(
      HttpClientRequest.prependUrl("http://localhost:3000/rpc")
    )
  );
  return RpcResolver.toClient(HttpRpcResolver.make<Router>(client));
});

export const program: Effect.Effect<
  Todo[],
  GetTodoError,
  HttpClient.HttpClient
> = Effect.gen(function* () {
  const client: <Req extends GetTodoById | GetTodos>(
    request: Req
  ) => Rpc.Rpc.Result<Req, never> = yield* makeClient;

  yield* Effect.log("Running the client");

  const stream: Stream.Stream<Todo, GetTodoError, never> = client(
    new GetTodos()
  );

  return yield* stream.pipe(
    Stream.tap((todo) => Effect.log(todo)),

    Stream.runCollect,

    Effect.flatMap(
      Effect.forEach((todo) => client(new GetTodoById({ id: todo.id })), {
        batching: true,
      })
    ),

    Effect.tap(Console.log)
  );
});

/**
 * and now we can use the client with our rpc requests
 */
program.pipe(Effect.provide(FetchHttpClient.layer), Effect.runFork);
