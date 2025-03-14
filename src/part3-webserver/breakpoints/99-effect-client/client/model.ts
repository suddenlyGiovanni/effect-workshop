import {
  BadStartupMessageError,
  ServerOutgoingMessage as ClientIncomingMessage,
  ServerOutgoingMessageFromJSON as ClientIncomingMessageFromJSON,
  ServerIncomingMessage as ClientOutgoingMessage,
  ServerIncomingMessageFromJSON as ClientOutgoingMessageFromJSON,
  StartupMessage,
  StartupMessageFromJSON,
  UnknownIncomingMessageError,
  type WebSocketConnection,
  WebSocketError,
} from "../shared/model.ts";

export {
  StartupMessage,
  StartupMessageFromJSON,
  BadStartupMessageError,
  ClientOutgoingMessage,
  ClientOutgoingMessageFromJSON,
  ClientIncomingMessage,
  ClientIncomingMessageFromJSON,
  WebSocketError,
  UnknownIncomingMessageError,
};

export { colors, Color, AvailableColorsResponse } from "../shared/model.ts";

export interface ClientWebSocketConnection
  extends WebSocketConnection<ClientIncomingMessage, ClientOutgoingMessage> {}
