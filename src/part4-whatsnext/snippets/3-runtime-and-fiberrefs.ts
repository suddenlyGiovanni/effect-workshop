import {
  Cause,
  Context,
  Effect,
  Exit,
  Fiber,
  FiberRef,
  FiberRefs,
  Layer,
  Runtime,
  Scope,
  pipe,
} from "effect";

/**
 * A `Runtime<R>` can run effects of type `Runnable extends Effect<any, any, R>`.
 * The runtime is whats responsible for
 * - executing effects,
 * - spawning fibers,
 * - handling unexpected errors,
 * - yielding
 * - and scheduling fibers,
 * - ensuring all finalizers are run,
 * - and handling all async operations.
 *
 * All effects up to now have been executed with the default runtime, `Runtime.defaultRuntime`.
 * Effect.runSync is actually equivalent to `<A, E>(effect: Effect.Effect<A, E, never>) => A`
 */
const runSync = Runtime.runSync(Runtime.defaultRuntime);

/**
 * Q: What is a `Runtime`?
 *
 * We can think of it as a black box that takes in a starting `Context<R>` and `Effect<A, E, R>` as input
 * and produces an `Exit<A, E>` as output.
 *
 * Lets look how to create one:
 */

const rt: Runtime.Runtime<never> = Runtime.make({
  context: Context.empty(),
  fiberRefs: FiberRefs.empty(),
  runtimeFlags: Runtime.defaultRuntimeFlags,
});

/**
 * We'll get to fiberRefs and runtimeFlags in a second, for now lets look at the `Context`.
 *
 * When we construct a runtime with an empty context, it produces a `Runtime<never>`.
 * This means that the runtime can only run effects that require no services.
 */

// But are running multiple effects seperately, that all require the same services
// The most common example of this is integrating effect with non-effect code
// consider this example

class Database extends Context.Tag("Database")<
  Database,
  { getUserById: (id: number) => Effect.Effect<string, Error> }
>() {
  static readonly Live = Layer.scoped(
    Database,
    Effect.acquireRelease(
      Effect.sync(() => {
        console.log("creating database");

        return { getUserById: (id: number) => Effect.succeed(`user ${id}`) };
      }),
      () =>
        Effect.sync(() => {
          console.log("closing database");
        })
    )
  );
}

const handlerEffect = (id: number): Effect.Effect<string, Error, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.getUserById(id);
  });

const handler = async (req: Request): Promise<Response> => {
  const searchParams = new URL(req.url).searchParams;

  const id = Number(searchParams.get("id"));

  const exit: Exit.Exit<string, Error> = await Effect.runPromiseExit(
    handlerEffect(id).pipe(
      Effect.provide(Database.Live) // here we provide the database service that gets created and closed for every handler call... expensive!
    )
  );

  return Exit.match(exit, {
    onSuccess: (user) => new Response(user),
    onFailure: (error) => new Response(Cause.pretty(error), { status: 500 }),
  });
};

/**
 * As it is currently implemented, our database is getting constructed every time we run the handler!
 * We can fix this by creating a runtime with the database as a service
 * and then running our effects with that runtime.
 *
 * If the service is not effectful to create (i.e. you don't need a Layer),
 * we can simply provide it in the context when creating the runtime
 */

const customRuntime = Runtime.make({
  context: Context.empty().pipe(
    Context.add(Database, {
      getUserById: (id: number) => Effect.succeed(`user ${id}`),
    })
  ),
  fiberRefs: FiberRefs.empty(),
  runtimeFlags: Runtime.defaultRuntimeFlags,
});

Runtime.runPromiseExit(customRuntime)(handlerEffect(1)); // look ma, no provide!

/**
 * For more complex services, we can use layers to create the context.
 * Then use `Layer.runtime` to create the runtime effectfully.
 * One additional detail is, because our layers might be scoped, we need some way to close that scope
 * (because they aren't just closed when the effect is done)
 * so we can manually create and close a scope when we are finished using the runtime.
 */

const scope: Scope.CloseableScope = Effect.runSync(Scope.make());

const effectfulCustomRuntime: Runtime.Runtime<Database> =
  await Effect.runPromise(
    pipe(Database.Live, Layer.toRuntime, Scope.extend(scope))
  );

Runtime.runPromiseExit(effectfulCustomRuntime)(handlerEffect(1));

/**
 * When we're done with the runtime, we can close the scope
 */
Effect.runFork(Scope.close(scope, Exit.void));

/**
 * Next up is `FiberRefs`, which is really just a collection of `FiberRef`s.
 *
 * A `FiberRef` is a mutable reference that is local to a single fiber (like a thread-local variable)
 * They are useful for storing contextual state, with a sensible default value.
 *
 * Consider many things we have encountered so far:
 * concurrency level, log level, context - these are all stored in a `FiberRef`
 * tracing is also a great example of a `FiberRef`, where we store the current span in a `FiberRef`
 *
 *
 *
 * Q: how do they actually work?
 *
 * A `FiberRef` is really just an identifier with an initial value.
 * By default, the value of a `FiberRef` is the initial value
 * Each fiber has its own map of `FiberRef`s to values
 * When we modify a `FiberRef`, we are only modifying the value for the current fiber.
 */

{
  const program = Effect.gen(function* () {
    const annotation: FiberRef.FiberRef<string | null> = yield* FiberRef.make<
      string | null
    >(null);

    const log = (message: string): Effect.Effect<void, never, never> =>
      Effect.gen(function* () {
        const currentAnnotation = yield* FiberRef.get(annotation);
        console.log(`${currentAnnotation ?? ""} - ${message}`);
      });

    const fiber1: Fiber.RuntimeFiber<void, never> = yield* pipe(
      Effect.gen(function* () {
        yield* FiberRef.set(annotation, "fiber1");
        yield* log("hello from fiber1");
      }),
      Effect.fork
    );

    const fiber2: Fiber.RuntimeFiber<void, never> = yield* pipe(
      Effect.gen(function* () {
        yield* FiberRef.set(annotation, "fiber2");
        yield* log("hello from fiber2");
      }),
      Effect.fork
    );

    yield* Fiber.joinAll([fiber1, fiber2]);

    const mainFiberFinalAnnotation: string | null =
      yield* FiberRef.get(annotation);

    console.log(`final annotation: ${mainFiberFinalAnnotation}`);
  }).pipe(Effect.scoped);

  Effect.runPromise(program);
}

/**
 * Notice how the annotation is different for each fiber,
 * and the main fiber does NOT have its initial value as the final value.
 *
 * This is because FiberRefs have well defined `fork` and `join` semantics;
 *
 * - When a fiber is `forked`, the new fiber gets a copy of the current fibers `FiberRef` values,
 * 	but this can be customized per `FiberRef`.
 *
 * - When a fiber is `joined`, the values of the joined fibers are merged into the current fibers values
 * 	again, this can be customized per `FiberRef`.
 *
 * ___
 *
 * So when we create a runtime, we have the opportunity to set the initial values of the `FiberRef`s
 * for 'main' fibers created by that runtime.
 *
 * Finally, the `RuntimeFlags` is a number representing bitflags that control ultra low-level runtime behavior
 * check out the api docs for more info if you are interested.
 */
