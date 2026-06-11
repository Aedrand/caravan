import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  // pino structured logging arrives with the server shell (M0.5)
  console.log(`caravan server listening on http://localhost:${info.port}`);
});
