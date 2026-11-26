import { useEffect, useState, type SyntheticEvent } from "react";
import { App } from "../App";
import { apiUrl } from "../services/api";

export interface SessionUser {
  email: string;
  name: string;
}

/** Só monta o app (e portanto só carrega ou salva dados) depois que o servidor confirma a sessão. */
export function AuthGate() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = window.localStorage.getItem("toolz-theme") === "light" ? "light" : "dark";
    fetch(apiUrl("/api/auth/me"))
      .then((response) => (response.ok ? response.json() : null))
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return null;
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <App
      user={user}
      onLogout={() => {
        fetch(apiUrl("/api/auth/logout"), { method: "POST" }).finally(() => setUser(null));
      }}
    />
  );
}

function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);

    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        body: JSON.stringify({ email, password }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const body = await response.json();

      if (response.ok) {
        onLogin(body);
        return;
      }

      setError(body.message ?? "Não foi possível entrar.");
    } catch {
      setError("Não foi possível falar com o servidor.");
    }

    setSending(false);
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-brand">
          <tna-logo intro style={{ width: 190 }} />
        </div>
        <h1>Entrar na plataforma</h1>
        <p>Acesse seus projetos, boards, sprints e cerimonias.</p>
        <form onSubmit={handleSubmit}>
          <label>
            <span>E-mail</span>
            <input autoComplete="username" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            <span>Senha</span>
            <input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <div className="login-feedback error">{error}</div>}
          <button className="primary-button" disabled={sending} type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}
