import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { prisma } from "../database/prisma.js";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function derive(password: string, salt: Buffer, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await derive(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// No banco fica só o hash do token: um vazamento da tabela não entrega sessões válidas.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Compara mesmo sem usuário, para o tempo de resposta não revelar quais e-mails existem.
  const valid = await verifyPassword(password, user?.passwordHash ?? `scrypt:00:${"0".repeat(128)}`);
  if (!user || !valid) return null;

  const token = randomBytes(32).toString("hex");
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) }
  });

  return { token, user: { email: user.email, name: user.name } };
}

export async function getSessionUser(token: string) {
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return { email: session.user.email, name: session.user.name };
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Troca a senha e encerra as outras sessões do usuário. Devolve false se a senha atual estiver errada. */
export async function changePassword(token: string, currentPassword: string, newPassword: string) {
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session || !(await verifyPassword(currentPassword, session.user.passwordHash))) return false;

  await prisma.$transaction([
    prisma.user.update({ where: { id: session.userId }, data: { passwordHash: await hashPassword(newPassword) } }),
    prisma.session.deleteMany({ where: { userId: session.userId, tokenHash: { not: tokenHash } } })
  ]);
  return true;
}

/** Cria o primeiro usuário a partir de ADMIN_EMAIL e ADMIN_PASSWORD, apenas se não houver nenhum. */
export async function ensureInitialUser() {
  if ((await prisma.user.count()) > 0) return;

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("Nenhum usuário cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD e reinicie.");
    return;
  }

  await prisma.user.create({
    data: { email, name: process.env.ADMIN_NAME || email.split("@")[0], passwordHash: await hashPassword(password) }
  });
  console.log("Usuário inicial criado.");
}
