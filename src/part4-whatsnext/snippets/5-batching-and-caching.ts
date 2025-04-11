import { Console, Effect, Layer, Request, RequestResolver } from "effect";

/**
 * Very often in apps we have 'requests' that are operations on some external data source
 * consider this short example
 */

interface User {
  readonly id: number;
  readonly name: string;
  readonly todoIds: ReadonlyArray<number>;
}

interface Todo {
  readonly _tag: "Todo";
  readonly id: number;
  readonly text: string;
  readonly completed: boolean;
}

class GetTodoError {
  readonly _tag = "GetTodosError";
}

class GetUserError {
  readonly _tag = "GetUserError";
}

const simulatedValidation = async <A>(
  promise: Promise<Response>
): Promise<A> => {
  /**
   * In a real world scenario, we may not want to trust our APIs to actually return the expected data
   */
  return promise.then((res) => res.json() as Promise<A>);
};

{
  const getUser: Effect.Effect<User, GetUserError, never> = Effect.tryPromise({
    try: () =>
      simulatedValidation<User>(fetch("https://api.example.demo/user")),
    catch: () => new GetUserError(),
  });

  const getTodoById = (id: number): Effect.Effect<Todo, GetTodoError, never> =>
    Effect.tryPromise({
      try: () =>
        simulatedValidation<Todo>(
          fetch(`https://api.example.demo/getTodoById?id=${id}`)
        ),
      catch: () => new GetTodoError(),
    });

  const main: Effect.Effect<void, GetUserError | GetTodoError, never> =
    Effect.gen(function* () {
      const users = yield* getUser;
      const todos = yield* Effect.all(users.todoIds.map(getTodoById), {
        concurrency: "unbounded",
      });

      yield* Console.log(todos);
    });
}

/**
 * While this code totally works, it has a few problems
 * 1. N+1 problem - we are making a request for each todo, this can be slow and expensive.
 * 2. No caching - if we make the same request twice, we will get the same data twice.
 *
 *
 * We could of course implement these features ourselves, but that would be a lot of work.
 * Effect has a built in solution for this, with its 'Requests' apis.
 *
 *
 * We start by declaring our Requests.
 * First as an interface: `interface MyRequests extends Request.Requests<ReturnType, ErrorType> { ...inputs... }`
 */
interface GetUserRequest extends Request.Request<User, GetUserError> {
  readonly _tag: "GetUser";
}
interface GetTodoByIdRequest extends Request.Request<Todo, GetTodoError> {
  readonly _tag: "GetTodoById";
  readonly id: number;
}

/**
 * And by value similar to how we declare context tags
 */
const GetUserRequest = Request.tagged<GetUserRequest>("GetUser");
const GetTodoByIdRequest = Request.tagged<GetTodoByIdRequest>("GetTodoById");

/**
 * Next, we declare our `Resolvers` which are the functions that actually perform the requests
 */

const GetUserResolver: RequestResolver.RequestResolver<GetUserRequest, never> =
  RequestResolver.fromEffect((request: GetUserRequest) =>
    Effect.tryPromise({
      try: () =>
        simulatedValidation<User>(fetch("https://api.example.demo/user")),
      catch: () => new GetUserError(),
    })
  );

/**
 * The key feature here is that resolvers are able to be 'batched'
 * This means that it can take multiple requests and perform them all at once
 */
const GetTodoByIdResolver: RequestResolver.RequestResolver<
  GetTodoByIdRequest,
  never
> = RequestResolver.makeBatched((requests: Array<GetTodoByIdRequest>) =>
  Effect.tryPromise({
    try: () =>
      simulatedValidation<Todo[]>(
        fetch(
          `https://api.example.demo/getTodoByIdBatched?ids=${requests
            .map((r) => r.id)
            .join(",")}`
        )
      ),
    catch: () => new GetTodoError(),
  }).pipe(
    Effect.flatMap((todos) =>
      Effect.forEach(requests, (request, index) =>
        Request.completeEffect(request, Effect.succeed(todos[index]!))
      )
    ),

    Effect.catchAll((error) =>
      Effect.forEach(requests, (request) =>
        Request.completeEffect(request, Effect.fail(error))
      )
    )
  )
);

/**
 * Now we can use these in combinate with `Effect.request` to perform the requests
 * Then it's as easy as rewriting the same function signatures as before
 */

const getUser: Effect.Effect<User, GetUserError, never> = Effect.request(
  GetUserRequest({}),
  GetUserResolver
);

const getTodoById = (id: number): Effect.Effect<Todo, GetTodoError, never> =>
  Effect.request(GetTodoByIdRequest({ id }), GetTodoByIdResolver);

/**
 * Q: Well, we've done all this work, what do we get?
 *
 * If we enable batching (just like how we set concurrency in `Effect.all`)
 * you can also use `Effect.withRequestBatching` to enable batching for all requests in a scope
 * now, any requests made within the 'effect.all' will be batched together when possible.
 */

const main: Effect.Effect<void, GetTodoError | GetUserError, never> =
  Effect.gen(function* () {
    const users = yield* getUser;
    const todos = yield* Effect.all(users.todoIds.map(getTodoById), {
      batching: true,
    });
    yield* Console.log(todos);
  });

/**
 * This has reduced our N+1 requests to just 2 requests
 *
 * We also get caching for free with just a single function
 */

main.pipe(Effect.repeat({ times: 10 }), Effect.withRequestCaching(true));
// or with a custom cache
main.pipe(
  Effect.repeat({ times: 10 }),
  Effect.provide(
    Layer.setRequestCache(
      Request.makeCache({
        capacity: 100,
        timeToLive: "12 seconds",
      })
    )
  )
);

/**
 * the default cache has a capacity of 65000, and a time to live of 60 seconds
 */
{
  interface TestReq extends Request.Request<void, never> {
    readonly id: number;
    readonly _tag: "TestReq";
  }
  const TestReq = Request.tagged<TestReq>("TestReq");
  const TestReqResolver = RequestResolver.makeBatched(
    (requests: Array<TestReq>) =>
      Effect.gen(function* () {
        yield* Console.log(
          "received request",
          requests.map((r) => r.id)
        );
      }).pipe(
        Effect.zipRight(
          Effect.forEach(requests, (request) =>
            Request.completeEffect(request, Effect.void)
          )
        )
      )
  );

  const makeRequest = (id: number): Effect.Effect<void, never, never> =>
    Effect.request(TestReq({ id }), TestReqResolver);

  const main: Effect.Effect<void, never, never> = Effect.gen(function* () {
    const requests = [
      Effect.sleep("1 seconds").pipe(
        Effect.zipRight(Console.log("slept for 1 second"))
      ),
      makeRequest(2),
      makeRequest(3),
    ];
    yield* Effect.all(requests, { batching: true, concurrency: "unbounded" });
  });

  Effect.runPromise(main); // requests don't even begin until the sleep is done
}
/**
 * Consider this example...
 *
 * Be mindful when you use batching.
 * When you enable it, it basically tells the runtime to pause all effects waiting for a batched request resolver;
 * to wait until every other running request has either finished, errored,
 * or is also waiting for the same batched request resolver.
 */
