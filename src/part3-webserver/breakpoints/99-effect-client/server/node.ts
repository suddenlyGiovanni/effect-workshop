import { createServer } from "node:http";
import { Context, Layer } from "effect";

export class NodeServer extends Context.Tag("NodeServer")<
  NodeServer,
  ReturnType<typeof createServer>
>() {
  public static readonly Live = Layer.sync(NodeServer, createServer);
}
