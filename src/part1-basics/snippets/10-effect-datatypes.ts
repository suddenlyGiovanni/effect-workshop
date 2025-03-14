import {
  Cause,
  Chunk,
  Data,
  Duration,
  Effect,
  Either,
  Equal,
  Exit,
  Hash,
  HashSet,
  Option,
  pipe,
} from "effect";
import type { FiberId } from "effect/FiberId";

/**
 * Effect has a number of useful datatypes that are commonly used
 * Let's briefly go through them:
 */

/**
 * `Option`
 *
 * Option is a datatype that represents a value that may or may not be present
 * ```ts
 * type Option<A> = Some<A> | None
 * ```
 *
 * It is superior to using `null` or `undefined` because it is much more composable
 */

/**
 * `Option` constructors
 */
const none = Option.none();
const some = Option.some(1);
Option.fromNullable(null);

/**
 * `Option` common operations:
 */
declare const opt: Option.Option<number>;

if (Option.isSome(opt)) {
  opt.value;
}
Option.map(opt, (x) => x + 1);
Option.flatMap(opt, (x) => Option.some(x + 1));
Option.match(opt, {
  onSome: (x) => x + 1,
  onNone: () => 0,
});

/**
 * `Option` destructors:
 */
Option.getOrElse(opt, () => 0);
Option.getOrThrow(opt);
Option.getOrNull(opt);
Option.getOrUndefined(opt);

/**
 * `Either`
 *
 * Very similar to Option is Either:
 * Either is a datatype that represents a value that may be one of two types.
 *
 * Option is really just an Either where the left type is void
 */

const left: Either.Either<never, number> = Either.left(1);
const right: Either.Either<string, never> = Either.right("error");

/**
 * `Either` common operations:
 */
declare const _either: Either.Either<number, string>;
if (Either.isRight(_either)) {
  _either.right;
}
if (Either.isLeft(_either)) {
  _either.left;
}
Either.map(_either, (right: number): number => right + 1);
Either.mapLeft(_either, (left: string): number => left.length);
Either.mapBoth(_either, {
  onRight: (x: number): number => x + 1,
  onLeft: (x: string): number => x.length,
});
Either.flatMap(_either, (right: number) => Either.right(right + 1));
Either.match(_either, {
  onRight: (x) => x + 1,
  onLeft: (x) => x + 1,
});

/**
 * You might notice that these operations are very similar to Effect operations...
 * That leads to the questions:
 *
 * > 1. When should you use Option/Either and when should you use Effect?
 * > 2. And how to you convert from one to the other?
 *
 * ---
 *
 * One key distinction is that
 * - `Effect` operations are lazy,
 * - while `Option | Either` operations are eager!
 */
const sideEffect = (x: number) => {
  console.log("side effect!");
  return x + 1;
};

/**
 * Effects are lazy:
 * Nothing has happened yet, the effect has not been run
 */
const effect = pipe(
  Effect.succeed(1),
  Effect.map((x) => sideEffect(x)) // does not log 'side effect!' until run
);

/**
 * `Either | Option` are eager:
 * The side effect has already happened
 */
const either = pipe(
  Either.left(1),
  Either.mapLeft((x) => sideEffect(x)) // logs 'side effect!'
);

/**
 * When should you use Option/Either?
 *
 * 1. To Interop with non-effect code:
 * 	Because option/either are purely synchronous, they are great for interoping
 * 	with non-effect code while still preserving the benefits of typed errors and
 * 	composable operations
 *
 * 2. When you just need to represent DATA:
 * 	- Effects represent computations
 * 	- Option/Either represent data: if you have a value that is either present or not, or is one of two types.
 */

/**
 * even if It's for things that are not side effects, or don't require any services
 */
declare function doLogicThatMightFail1(): Either.Either<string, Error>;

/**
 * if this can be an effect, make it an effect
 */
declare function doLogicThatMightFail2(): Effect.Effect<string, Error>;

/**
 * How do you convert from one to the other?
 *
 * `Option` and `Either` are conveniently both subtypes of `Effect`,
 * meaning they can be used interchangeably in any Effect context
 *
 * `Option<T>` -> `Effect<T, NoSuchElementException>`
 * `Either<E, A>` -> `Effect<A, E>`
 */

const result = pipe(
  Option.some(5),
  Effect.flatMap((x) => Either.right(x.toString()))
);

/**
 * Next is `Exit`, which is basically a `Either<A, Cause<E>>`
 * It is used to represent the result of a computation
 */

const program = Effect.runSyncExit(Effect.succeed(1));

Exit.match(program, {
  onFailure: (cause) =>
    console.error(`Exited with failure state: ${cause._tag}`),
  onSuccess: (value) => console.log(`Exited with success value: ${value}`),
});

/**
 * What is a `Cause`?
 * It is a discriminated union of all the possible ways a computation can complete
 *
 * Its variations are:
 * - `Empty` => (no error),
 * - `Fail` => (expected error),
 * - `Die` => (unexpected error),
 * - `Interrupt`
 * - `Sequential` =>  (multiple causes that happened in sequence)
 * - `Parallel` => (multiple causes that happened in parallel)
 */

declare const cause: Cause.Cause<number>;
Cause.match(cause, {
  onEmpty: undefined,
  onFail: (error: number): unknown => {
    throw new Error("Function not implemented.");
  },
  onDie: (defect: unknown): unknown => {
    throw new Error("Function not implemented.");
  },
  onInterrupt: (fiberId: FiberId): unknown => {
    throw new Error("Function not implemented.");
  },
  onSequential: (left: unknown, right: unknown): unknown => {
    throw new Error("Function not implemented.");
  },
  onParallel: (left: unknown, right: unknown): unknown => {
    throw new Error("Function not implemented.");
  },
});

/**
 * Duration is a datatype that represents a time duration
 */

/**
 * Duration constructors:
 */
Duration.millis(1000);
Duration.seconds(1);
Duration.minutes(1);
Duration.zero;
Duration.infinity;
Duration.decode("7 hours");

/**
 * Duration destructors
 */
Duration.toMillis(Duration.millis(1000));
Duration.toSeconds(Duration.seconds(1));

/**
 * Duration operations
 */
Duration.lessThan(Duration.millis(1000), Duration.seconds(1));
Duration.greaterThan(Duration.millis(1000), Duration.seconds(1));
Duration.sum(Duration.millis(1000), Duration.seconds(1));
Duration.times(Duration.millis(1000), 4);

/**
 * Effect also has a number of data structures
 * They are all functional and immutable
 *
 * - List: a linked list,
 * - HashMap,
 * - HashSet,
 * - RedBlackTree,
 * - and more...
 *
 * But the most common your likely to see is `Chunk`.
 * `Chunks` are ordered collections of elements, often backed by an array,
 * but are immutable, functional, and fast due to structural sharing
 */

const c1 = Chunk.make(1, 2, 3);
const c2 = Chunk.fromIterable([1, 2, 3]);
const c3 = Chunk.append(c1, c2);
const c4 = Chunk.drop(c3, 2);
Chunk.toReadonlyArray(c4);

/**
 * Finally 'Traits'.
 *
 *
 * Effect has two 'traits', `Equal` and `Hash`.
 * They are used to compare two values with `Equals.equals` and hash a value with `Hash.hash`.
 * All values have a default implementation, but you can provide your own for custom types.
 * This is commonly used for checking deep equality of data structures and for
 * using values as keys in a Map or Set.
 */

const s1 = new Set<Chunk.Chunk<number>>();
s1.add(Chunk.make(1, 2, 3));
s1.add(Chunk.make(1, 2, 3));
console.log("s1", s1.size); // 2 because of referentially equality

let s2 = HashSet.empty<Chunk.Chunk<number>>();
s2 = HashSet.add(s2, Chunk.make(1, 2, 3));
s2 = HashSet.add(s2, Chunk.make(1, 2, 3));
console.log("s2", HashSet.size(s2)); // 1 because of structural equality

/**
 * To 'implement' a trait you just provide a function with the 'equals' or 'hash' symbol
 * very similar to how you make a type iterable
 */

class Foo1 {
  public readonly x: number;

  constructor(x: number) {
    this.x = x;
  }
}

class Foo2 implements Equal.Equal, Hash.Hash {
  readonly x: number;

  constructor(x: number) {
    this.x = x;
  }

  [Equal.symbol](that: unknown): boolean {
    return that instanceof Foo2 && that.x === this.x;
  }

  [Hash.symbol](): number {
    return Hash.number(this.x);
  }
}

let s3 = HashSet.empty<Foo1 | Foo2>();
s3 = HashSet.add(s3, new Foo1(1));
s3 = HashSet.add(s3, new Foo1(1));
s3 = HashSet.add(s3, new Foo2(1));
s3 = HashSet.add(s3, new Foo2(1));
console.log("s3", HashSet.size(s3)); // 3 because Foo2 are considered equal
console.log(Equal.equals(new Foo1(1), new Foo1(1))); // false
console.log(Equal.equals(new Foo2(1), new Foo2(1))); // true

/**
 * The Data module contains a number of functions that implement deep equality
 * and hashing for custom types for you.
 */
interface Foo3 {
  readonly a: number;
  readonly b: string;
}

const Foo3 = Data.case<Foo3>();
const f3 = Foo3({ a: 1, b: "a" });

interface TaggedFoo3 {
  readonly _tag: "Foo3";
  readonly a: number;
  readonly b: string;
}

const TaggedFoo3 = Data.tagged<TaggedFoo3>("Foo3");
const tf3 = TaggedFoo3({ a: 1, b: "a" });

/**
 * or in one step with classes
 */
class Foo4 extends Data.Class<{ readonly a: number; readonly b: string }> {}
const f4 = new Foo4({ a: 1, b: "a" });

class TaggedFoo4 extends Data.TaggedClass("Foo4")<{
  readonly a: number;
  readonly b: string;
}> {}
const tf4 = new TaggedFoo4({ a: 1, b: "a" });

/**
 * custom behavior at the same time:
 */
class Foo5 extends Data.TaggedClass("Foo5")<{
  readonly a: number;
  readonly b: string;
}> {
  get c(): number {
    return this.a + this.b.length;
  }

  ab(): string {
    return String(this.a) + this.b;
  }
}
const f5 = new Foo5({ a: 1, b: "a" });
console.log(f5.c); // 2
console.log(f5.ab()); // "1a"

/**
 * helper for creating tagged union of case classes
 */
type AppState = Data.TaggedEnum<{
  Startup: Record<never, never>;
  Loading: {
    readonly status: string;
  };
  Ready: {
    readonly data: number;
  };
}>;

const { Startup, Loading, Ready } = Data.taggedEnum<AppState>();

const state1 = Startup();
const state2 = Loading({ status: "loading" });
const state3 = Ready({ data: 42 });
const state4 = Loading({ status: "loading" });

console.log(Equal.equals(state2, state4)); // true
console.log(Equal.equals(state2, state3)); // false

declare const state: AppState;
switch (state._tag) {
  case "Startup":
    break;
  case "Loading":
    console.log(state.status);
    break;
  case "Ready":
    console.log(state.data);
    break;
}

/**
 * Finally, for creating custom error types there is
 * - `Data.Error` and
 * - `Data.TaggedError`
 */
class FooError extends Data.Error<{ readonly a: number; readonly b: string }> {}
class TaggedFooError extends Data.TaggedError("FooError")<{
  readonly a: number;
  readonly b: string;
}> {}

/**
 * These have the additional benefit of being subtypes of Effect, so you don't
 * have to wrap them in `Effect.fail`.
 */
const errors = Effect.gen(function* () {
  yield* new FooError({ a: 1, b: "a" });
});
