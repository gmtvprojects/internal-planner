import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter, requireAuth } from "./routes/auth.routes.js";
import { backlogRouter } from "./routes/backlog.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { integrationsRouter, linearWebhookRouter } from "./routes/integrations.routes.js";
import { makerFilesRouter } from "./routes/maker-files.routes.js";
import { workspaceStateRouter } from "./routes/workspace-state.routes.js";
import { ensureInitialUser } from "./services/auth.service.js";

const app = express();
const port = Number(process.env.PORT ?? 3333);

// Atrás do proxy do Railway: usa o IP real do cliente no limite de tentativas de login.
app.set("trust proxy", 1);

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/auth", express.json({ limit: "10kb" }), authRouter);

// O webhook do Linear não tem sessão: a própria rota exige o segredo.
app.use("/api/integrations/linear/webhook", express.json({ limit: "1mb" }), linearWebhookRouter);

// Tudo abaixo exige login. A autenticação vem antes de ler corpos grandes.
app.use("/api", requireAuth);
app.use(express.json({ limit: "30mb" })); // o estado do workspace pode conter imagens das reuniões

app.use("/api/dashboard", dashboardRouter);
app.use("/api/backlog", backlogRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/workspace-state", workspaceStateRouter);
app.use("/api/maker-files", makerFilesRouter);

// Em produção a própria API serve o frontend, no mesmo domínio.
const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
if (existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ message: "Erro inesperado." });
});

await ensureInitialUser();

app.listen(port, () => {
  console.log("API running on port " + port);
});
