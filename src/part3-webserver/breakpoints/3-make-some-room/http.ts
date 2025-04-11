import { Effect, Layer } from "effect";

import * as M from "./model.ts";
import {
  type CurrentConnections,
  HttpServer,
  getAvailableColors,
} from "./shared.ts";

export const Live: Layer.Layer<never, never, HttpServer | CurrentConnections> =
  Layer.effectDiscard(
    Effect.gen(function* () {
      const http = yield* HttpServer;

      const availableColors = yield* getAvailableColors;

      http.on("request", (req, res) => {
        if (req.url !== "/colors") {
          res.writeHead(404);

          res.end("Not Found");

          return;
        }

        const message = M.AvailableColorsResponse.make({
          _tag: "availableColors",
          colors: availableColors,
        });

        res.writeHead(200, { "Content-Type": "application/json" });

        res.end(JSON.stringify(message));
      });
    })
  );
