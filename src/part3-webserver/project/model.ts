import { Data, type ParseResult, Schema } from "effect";

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
export const Color = Schema.Literal(...colors);

export const StartupMessage = Schema.Struct({
  _tag: Schema.Literal("startup"),
  color: Color,
  name: Schema.String,
});

export type StartupMessage = Schema.Schema.Type<typeof StartupMessage>;

export class BadStartupMessageError extends Data.TaggedError(
  "BadStartupMessage"
)<{
  readonly error:
    | {
        readonly _tag: "parseError";
        readonly parseError: ParseResult.ParseError;
      }
    | { readonly _tag: "colorAlreadyTaken"; readonly color: Color };
}> {}

export const ServerIncomingMessage = Schema.Union(
  Schema.Struct({ _tag: Schema.Literal("message"), message: Schema.String })
);

export type ServerIncomingMessage = Schema.Schema.Type<
  typeof ServerIncomingMessage
>;

export class UnknownIncomingMessageError extends Data.TaggedError(
  "UnknownIncomingMessage"
)<{
  readonly rawMessage: string;
  readonly parseError: ParseResult.ParseError;
}> {}

export const ServerOutgoingMessage = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("message"),
    name: Schema.String,
    color: Color,
    message: Schema.String,
    timestamp: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal("join"),
    name: Schema.String,
    color: Color,
  }),
  Schema.Struct({
    _tag: Schema.Literal("leave"),
    name: Schema.String,
    color: Color,
  })
);
export type ServerOutgoingMessage = Schema.Schema.Type<
  typeof ServerOutgoingMessage
>;

export interface WebSocketConnection {
  readonly _rawWS: WebSocket;
  readonly name: string;
  readonly color: Color;
  readonly timeConnected: number;
}

export const AvailableColorsResponse = Schema.Struct({
  _tag: Schema.Literal("availableColors"),
  colors: Schema.Array(Color),
});

export type AvailableColorsResponse = Schema.Schema.Type<
  typeof AvailableColorsResponse
>;
