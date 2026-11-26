import { useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { apiUrl } from "../services/api";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setFeedback(null);

    if (newPassword !== confirmation) {
      setFeedback({ type: "error", message: "A confirmação não confere com a nova senha." });
      return;
    }

    setSending(true);

    try {
      const response = await fetch(apiUrl("/api/auth/password"), {
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      });

      if (response.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
        setFeedback({ type: "success", message: "Senha alterada. Outras sessões abertas foram encerradas." });
      } else {
        const body = await response.json();
        setFeedback({ type: "error", message: body.message ?? "Não foi possível trocar a senha." });
      }
    } catch {
      setFeedback({ type: "error", message: "Não foi possível falar com o servidor." });
    }

    setSending(false);
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section aria-label="Trocar senha" aria-modal="true" className="login-panel" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <h1>Trocar senha</h1>
        <p>Use pelo menos 8 caracteres.</p>
        <form onSubmit={handleSubmit}>
          <label>
            <span>Senha atual</span>
            <input autoComplete="current-password" autoFocus required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label>
            <span>Nova senha</span>
            <input autoComplete="new-password" maxLength={200} minLength={8} required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </label>
          <label>
            <span>Confirmar nova senha</span>
            <input autoComplete="new-password" required type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          {feedback && <div className={`login-feedback ${feedback.type}`}>{feedback.message}</div>}
          <button className="primary-button" disabled={sending} type="submit">Salvar nova senha</button>
        </form>
        <button className="login-link" type="button" onClick={onClose}>Fechar</button>
      </section>
    </div>,
    document.body
  );
}
