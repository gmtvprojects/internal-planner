import { Router, type Request, type RequestHandler, type Response } from "express";
import { changePassword, getSessionUser, login, logout, SESSION_TTL_MS } from "../services/auth.service.js";

const COOKIE = "planner_session";
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 1000 * 60 * 15;
const attempts = new Map<string, { count: number; resetAt: number }>();

function allowAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  const entry = current && current.resetAt > now ? current : { count: 0, resetAt: now + WINDOW_MS };
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  attempts.set(key, entry);
  return true;
}

function readToken(request: Request) {
  const match = request.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return match?.[1];
}

function setCookie(response: Response, value: string, maxAge: number) {
  response.cookie(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(process.env.RAILWAY_ENVIRONMENT) || process.env.NODE_ENV === "production",
    maxAge,
    path: "/"
  });
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  try {
    const token = readToken(request);
    if (token && (await getSessionUser(token))) {
      next();
      return;
    }
    response.status(401).json({ message: "Faça login para continuar." });
  } catch (error) {
    next(error);
  }
};

export const authRouter = Router();

authRouter.post("/login", async (request, response, next) => {
  try {
    const { email, password } = request.body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || password.length > 200) {
      response.status(400).json({ message: "Informe e-mail e senha." });
      return;
    }

    const key = request.ip ?? "desconhecido";
    if (!allowAttempt(key)) {
      response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos." });
      return;
    }

    const result = await login(email, password);
    if (!result) {
      response.status(401).json({ message: "E-mail ou senha incorretos." });
      return;
    }

    attempts.delete(key);
    setCookie(response, result.token, SESSION_TTL_MS);
    response.json(result.user);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", async (request, response, next) => {
  try {
    const token = readToken(request);
    const user = token ? await getSessionUser(token) : null;
    if (!user) {
      response.status(401).json({ message: "Sem sessão." });
      return;
    }
    response.json(user);
  } catch (error) {
    next(error);
  }
});

authRouter.put("/password", requireAuth, async (request, response, next) => {
  try {
    const { currentPassword, newPassword } = request.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || currentPassword.length > 200) {
      response.status(400).json({ message: "Informe a senha atual e a nova senha." });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 200) {
      response.status(400).json({ message: "A nova senha precisa ter de 8 a 200 caracteres." });
      return;
    }

    // Mesmo limite do login: uma sessão aberta não pode servir para adivinhar a senha.
    const key = `senha:${request.ip}`;
    if (!allowAttempt(key)) {
      response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos." });
      return;
    }

    // 400 e não 401: a sessão continua válida, só a senha atual está errada.
    if (!(await changePassword(readToken(request)!, currentPassword, newPassword))) {
      response.status(400).json({ message: "Senha atual incorreta." });
      return;
    }

    attempts.delete(key);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (request, response, next) => {
  try {
    const token = readToken(request);
    if (token) await logout(token);
    setCookie(response, "", 0);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});
