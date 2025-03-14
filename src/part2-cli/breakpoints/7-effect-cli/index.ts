import { Args, Command, Options } from "@effect/cli";
import {
  FetchHttpClient,
  FileSystem,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import {
  Console,
  Effect,
  Function,
  Match,
  Option,
  Schema as S,
  pipe,
} from "effect";

import * as M from "./model.ts";

const main = Effect.gen(function* () {
  const options = yield* M.CLIOptions;

  const client: HttpClient.HttpClient = yield* HttpClient.HttpClient;

  const body = Option.getOrUndefined(options.data);

  const req: HttpClientRequest.HttpClientRequest = yield* pipe(
    Match.value(options.method)
      .pipe(
        Match.when("GET", () => HttpClientRequest.get),
        Match.when("POST", () => HttpClientRequest.post),
        Match.when("PUT", () => HttpClientRequest.put),
        Match.when("PATCH", () => HttpClientRequest.patch),
        Match.when("DELETE", () => HttpClientRequest.del),
        Match.option
      )
      .pipe(
        Effect.map((reqBuilder) =>
          reqBuilder(options.url).pipe(
            HttpClientRequest.setHeaders(options.headers),
            body ? HttpClientRequest.bodyText(body) : Function.identity
          )
        )
      )
  );

  const res: HttpClientResponse.HttpClientResponse = yield* client.execute(req);

  const buffer: string[] = [];

  if (Option.isSome(options.include)) {
    buffer.push(`${res.status}`);
    for (const [key, value] of Object.entries(res.headers)) {
      buffer.push(`${key}: ${value}`);
    }
    // Add an empty line to separate headers from body
    buffer.push("");
  }

  const text = yield* res.text;
  buffer.push(text);

  const finalString = buffer.join("\n");

  const fs: FileSystem.FileSystem = yield* FileSystem.FileSystem;
  yield* pipe(
    Effect.matchEffect(options.output, {
      onSuccess: (output) => fs.writeFileString(output, finalString),
      onFailure: () => Console.log(finalString),
    })
  );
}).pipe(Effect.scoped);

const StringPairsFromStrings = S.Array(S.String).pipe(
  S.filter((arr) => arr.every((s) => s.split(": ").length === 2)),
  S.transform(S.Array(S.Tuple(S.String, S.String)), {
    decode: (arr) =>
      arr.map((s) => s.split(": ") as unknown as readonly [string, string]),
    encode: (arr) => arr.map((s) => s.join(": ")),
  })
);

const urlArg = Args.text({ name: "url" }).pipe(
  Args.withDescription("The URL to send the request to")
);

const methodOption = Options.text("method").pipe(
  Options.withAlias("X"),
  Options.withDescription("The HTTP method to use"),
  Options.withSchema(S.Literal("GET", "POST", "PUT", "PATCH", "DELETE")),
  Options.withDefault("GET")
);

const dataOption = Options.text("data").pipe(
  Options.withAlias("d"),
  Options.withDescription("The body of the request"),
  Options.optional
);

const headersOption = Options.text("header").pipe(
  Options.withAlias("H"),
  Options.withDescription("The headers to send with the request"),
  Options.repeated,
  Options.map((_) => _ as ReadonlyArray<string>),
  Options.withSchema(StringPairsFromStrings)
);

const outputOption = Options.file("output").pipe(
  Options.withAlias("o"),
  Options.withDescription("The file to write the response to"),
  Options.optional
);

const includeOption = Options.boolean("include").pipe(
  Options.withAlias("i"),
  Options.withDescription("Include the response headers in the output"),
  Options.optional
);

const cli = pipe(
  Command.make("root", {
    url: urlArg,
    method: methodOption,
    data: dataOption,
    headers: headersOption,
    output: outputOption,
    include: includeOption,
  }),
  Command.withHandler(() => main),
  Command.provideSync(M.CLIOptions, (_) => _),
  Command.run({
    name: "bend",
    version: "1.0.0",
  }),
  (run) => Effect.suspend(() => run(process.argv))
);

pipe(
  cli,
  Effect.provide(FetchHttpClient.layer),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
);
