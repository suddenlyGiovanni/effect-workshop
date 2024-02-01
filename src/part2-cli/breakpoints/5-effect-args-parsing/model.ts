import { Context, Data, Option } from "effect";

export class UnknownError extends Data.TaggedError("UnknownError")<{
  readonly error: unknown;
}> {}

export class TextDecodeError extends Data.TaggedError("TextDecodeError") {}

export class HeaderParseError extends Data.TaggedError("HeaderParseError") {}

type Fetch = {
  readonly _: unique symbol;
};

export const Fetch = Context.Tag<Fetch, typeof globalThis.fetch>("Fetch");

type CLIOptions = {
  readonly _: unique symbol;
};

interface CLIOptionsImpl {
  readonly url: string;
  readonly method: string;
  readonly data: Option.Option<string>;
  readonly headers: Option.Option<readonly [string, string][]>;
  readonly output: Option.Option<string>;
  readonly include: Option.Option<boolean>;
}

export const CLIOptions = Context.Tag<CLIOptions, CLIOptionsImpl>("CLIOptions");

export class CliOptionsParseError extends Data.TaggedError(
  "CliOptionsParseError"
)<{
  readonly error: unknown;
}> {}
