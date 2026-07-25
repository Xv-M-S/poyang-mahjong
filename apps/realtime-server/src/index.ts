import { pathToFileURL } from "node:url";

import { loadConfig } from "./config.ts";
import { createRealtimeServer } from "./transport/websocket-server.ts";

export { createRealtimeServer } from "./transport/websocket-server.ts";

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = loadConfig();
  const server = createRealtimeServer({ config });
  server.webSocketServer.on("listening", () => {
    const address = server.address();
    console.log(
      `Realtime server listening on ws://${config.host}:${address?.port ?? config.port}`,
    );
  });
}
