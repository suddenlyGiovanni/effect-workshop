import type { Fiber, HashMap, PubSub, Ref } from "effect";
import {
  BadStartupMessageError,
  ServerIncomingMessage,
  ServerIncomingMessageFromJSON,
  ServerOutgoingMessage,
  ServerOutgoingMessageFromJSON,
  StartupMessage,
  StartupMessageFromJSON,
  UnknownIncomingMessageError,
  type WebSocketConnection,
  WebSocketError,
} from "../shared/model.ts";

export { colors, Color, AvailableColorsResponse } from "../shared/model.ts";

export {
  BadStartupMessageError,
  ServerIncomingMessage,
  StartupMessage,
  UnknownIncomingMessageError,
  WebSocketError,
  ServerOutgoingMessage,
  StartupMessageFromJSON,
  ServerIncomingMessageFromJSON,
  ServerOutgoingMessageFromJSON,
};

export type ConnectionStore = Ref.Ref<
  HashMap.HashMap<string, ServerWebSocketConnection>
>;
export type MessagePubSub = PubSub.PubSub<ServerOutgoingMessage>;

export interface ServerWebSocketConnection
  extends WebSocketConnection<ServerIncomingMessage, ServerOutgoingMessage> {
  readonly receiveFiber: Fiber.Fiber<void, never>;
}
