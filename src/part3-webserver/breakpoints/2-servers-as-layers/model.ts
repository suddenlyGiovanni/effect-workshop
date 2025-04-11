import { Data, Schema as S } from "effect";
import type { ParseError } from "effect/ParseResult";

export const colors = [
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
] as const;
export type Color = (typeof colors)[number];
export const Color = S.Literal(...colors);

export const StartupMessage = S.Struct({
  _tag: S.Literal("startup"),
  color: Color,
  name: S.String,
});

export type StartupMessage = S.Schema.Type<typeof StartupMessage>;

export class BadStartupMessageError extends Data.TaggedError(
  "BadStartupMessage"
)<{
  readonly error:
    | { readonly _tag: "parseError"; readonly parseError: ParseError }
    | { readonly _tag: "colorAlreadyTaken"; readonly color: Color };
}> {}

export const ServerIncomingMessage = S.Union(
  S.Struct({
    _tag: S.Literal("message"),
    message: S.String,
  })
);

export type ServerIncomingMessage = S.Schema.Type<typeof ServerIncomingMessage>;

export class UnknownIncomingMessageError extends Data.TaggedError(
  "UnknownIncomingMessage"
)<{ readonly rawMessage: string; readonly parseError: ParseError }> {}

export const ServerOutgoingMessage = S.Union(
  S.Struct({
    _tag: S.Literal("message"),
    name: S.String,
    color: Color,
    message: S.String,
    timestamp: S.Number,
  }),
  S.Struct({
    _tag: S.Literal("join"),
    name: S.String,
    color: Color,
  }),
  S.Struct({
    _tag: S.Literal("leave"),
    name: S.String,
    color: Color,
  })
);
export type ServerOutgoingMessage = S.Schema.Type<typeof ServerOutgoingMessage>;

export interface WebSocketConnection {
  readonly _rawWS: WebSocket;
  readonly name: string;
  readonly color: Color;
  readonly timeConnected: number;
}

export const AvailableColorsResponse = S.Struct({
  _tag: S.Literal("availableColors"),
  colors: S.Array(Color),
});

export type AvailableColorsResponse = S.Schema.Type<
  typeof AvailableColorsResponse
>;
