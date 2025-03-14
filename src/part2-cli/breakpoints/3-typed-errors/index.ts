import * as fs from "node:fs/promises";
import { Console, Effect, Exit, Option, pipe } from "effect";
import type { UnknownException } from "effect/Cause";
import meow from "meow";

import * as M from "./model.ts";

const cli = meow(
  `
	Usage
	  $ bend [...options] <url>

	Options
	  --method, -X  The HTTP method to use
      --header, -H  The HTTP headers to use
      --data,   -d  The data to send
      --output, -o  The output file
      --include, -i Include the HTTP headers in the output
`,
  {
    importMeta: import.meta,
    flags: {
      method: {
        type: "string",
        shortFlag: "X",
        default: "GET",
        isRequired: false,
      },
      headers: {
        type: "string",
        shortFlag: "H",
        isMultiple: true,
        isRequired: false,
      },
      data: {
        type: "string",
        shortFlag: "d",
        isRequired: false,
      },
      output: {
        type: "string",
        shortFlag: "o",
        isRequired: false,
      },
      include: {
        type: "boolean",
        shortFlag: "i",
        isRequired: false,
      },
    },
  }
);
const arg = cli.input[0];
if (!arg) {
  console.error("No url provided");
  process.exit(1);
}

interface CLIOptions {
  method: string;
  data: string | undefined;
  headers: string[] | undefined;
  output: string | undefined;
  include: boolean | undefined;
}

function main(
  url: string,
  options?: CLIOptions
): Effect.Effect<
  void,
  M.HeaderParseError | M.UnknownError | M.TextDecodeError | UnknownException,
  never
> {
  return Effect.gen(function* () {
    const headers: [key: string, value: string][] = options?.headers
      ? yield* Effect.reduce(
          options.headers,
          new Array<[string, string]>(),
          (acc, header) => {
            const [key, value] = header.split(":");
            if (!key || !value) {
              return Effect.fail(new M.HeaderParseError());
            }
            acc.push([key, value]);
            return Effect.succeed(acc);
          }
        )
      : [];

    const res: Response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(url, {
          ...(options?.method && { method: options.method }),
          ...(options?.data && { body: options.data }),
          headers,
          signal,
        }),
      catch: (error) => new M.UnknownError({ error }),
    });

    const buffer: string[] = [];

    if (options?.include) {
      buffer.push(`${res.status} ${res.statusText}`);
      res.headers.forEach((value, key) => {
        buffer.push(`${key}: ${value}`);
      });
      // Add an empty line to separate headers from body
      buffer.push("");
    }

    const text = yield* Effect.tryPromise({
      try: () => res.text(),
      catch: () => new M.TextDecodeError(),
    });

    buffer.push(text);

    const finalString = buffer.join("\n");
    yield* Effect.matchEffect(Option.fromNullable(options?.output), {
      onSuccess: (output) =>
        Effect.tryPromise(() => fs.writeFile(output, finalString)),
      onFailure: () => Console.log(finalString),
    });
  });
}

const exit = await pipe(
  main(arg, cli.flags),
  Effect.catchTags({
    TextDecodeError: (error) => Console.error("Text decode error: ", error),
    UnknownError: (error) => Console.error("Unknown error: ", error),
  }),
  Effect.runPromiseExit
);

Exit.match(exit, {
  onSuccess: () => process.exit(0),
  onFailure: (cause) => {
    console.error(cause);
    process.exit(1);
  },
});
