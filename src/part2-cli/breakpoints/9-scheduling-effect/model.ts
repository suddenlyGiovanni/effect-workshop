import { Context, Data, type Duration, type Option } from "effect";

export class UnknownError extends Data.TaggedError("UnknownError")<{
  readonly error: unknown;
}> {}

export class TextDecodeError extends Data.TaggedError("TextDecodeError") {}

export class HeaderParseError extends Data.TaggedError("HeaderParseError") {}

export class CLIOptions extends Context.Tag("CLIOptions")<
  CLIOptions,
  {
    readonly url: string;
    readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    readonly data: Option.Option<string>;
    readonly headers: readonly (readonly [string, string])[];
    readonly output: Option.Option<string>;
    readonly include: Option.Option<boolean>;
    readonly repeatEvery: Option.Option<Duration.Duration>;
    readonly timeout: Duration.Duration;
    readonly maxRepeats: Option.Option<number>;
    readonly backoff: Option.Option<boolean>;
    readonly backoffFactor: Option.Option<number>;
    readonly backoffMax: Option.Option<Duration.Duration>;
  }
>() {}

export class CliOptionsParseError extends Data.TaggedError(
  "CliOptionsParseError"
)<{
  readonly error: unknown;
}> {}

export class TimeoutError extends Data.TaggedClass("TimeoutError")<{
  readonly timeout: Duration.Duration;
}> {}
