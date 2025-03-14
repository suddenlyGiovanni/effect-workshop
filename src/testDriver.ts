import assert from "node:assert";
import { Array, Console, Context, Effect, Layer, Ref, pipe } from "effect";

class TestLogs extends Context.Tag("TestLogs")<
  TestLogs,
  Ref.Ref<ReadonlyArray<unknown>>
>() {
  static readonly Live = Layer.effect(
    TestLogs,
    Ref.make<ReadonlyArray<unknown>>([])
  );
}

export class Test extends Context.Tag("Test")<
  Test,
  {
    logTest: (message: unknown) => Effect.Effect<void>;
    assertLogs: (expected: Array<unknown>) => Effect.Effect<void, Error>;
  }
>() {
  static readonly Live = Layer.effect(
    Test,
    Effect.gen(function* () {
      const logsRef = yield* TestLogs;
      const addLog = (message: unknown) =>
        Ref.update(logsRef, (logs) => Array.append(logs, message));

      const assertLogs = (expected: Array<unknown>) =>
        Ref.get(logsRef).pipe(
          Effect.flatMap((logs) => {
            return Effect.sync(() => assert.deepStrictEqual(logs, expected)); // defect on purpose
          })
        );

      return {
        logTest: (message: unknown) =>
          Effect.zipRight(
            Console.log("Test logging: ", message),
            addLog(message)
          ),
        assertLogs,
      };
    })
  );
}

const { logTest, assertLogs } = Effect.serviceFunctions(Test);
const testLive = Layer.provide(Test.Live, TestLogs.Live);

const testRunAssert = (
  number: number,
  effect: Effect.Effect<void, any, Test>,
  expected: {
    logs?: Array<unknown>;
    success?: unknown;
    successIs?: (output: unknown) => boolean;
    failure?: unknown;
    failureIs?: (output: unknown) => boolean;
  }
) =>
  pipe(
    Console.log(`\n--- Test ${number} Start ---`),
    Effect.zipRight(effect),
    Effect.zipLeft(assertLogs(expected.logs ?? [])),
    Effect.tapBoth({
      onSuccess: (value) =>
        Effect.sync(() => {
          if (expected.successIs) {
            assert(expected.successIs(value));
          } else {
            expected.success && assert.deepStrictEqual(value, expected.success);
          }
          expected.failure && assert.fail("Expected failure but got success");
        }),
      onFailure: (error) =>
        Effect.sync(() => {
          if (expected.failureIs) {
            assert(expected.failureIs(error));
          } else {
            expected.failure && assert.deepStrictEqual(error, expected.failure);
          }
          expected.success && assert.fail("Expected success but got failure");
        }),
    }), // again defect on purpose
    Effect.catchAll((error) => Effect.succeed(error)),
    Effect.andThen((value) => Console.log(`--- Test ${number} Passed ---\n`)),
    Effect.provide(testLive),
    Effect.catchAllCause((cause) => Console.error(cause.toString())),
    Effect.runPromise
  );

export { logTest, assertLogs, testRunAssert };
