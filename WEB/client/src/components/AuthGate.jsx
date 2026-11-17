import { useState } from "react";
import { useAuth } from "../auth.jsx";

export function AuthGate({ children }) {
  const { status, error, refresh } = useAuth();

  if (error && !status) {
    return (
      <section className="panel connection auth-screen">
        <p className="eyebrow">Balancio</p>
        <h1>The server didn’t respond.</h1>
        <p>{error}</p>
        <button type="button" className="btn" onClick={refresh}>Try again</button>
      </section>
    );
  }

  if (!status) return <p className="loading">Opening the book…</p>;

  if (!status.configured) return <SetupScreen />;
  if (!status.authenticated) return <LoginScreen />;
  return children;
}

function SetupScreen() {
  const { setup } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Those passwords don’t match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await setup(password);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="panel auth-card" onSubmit={onSubmit}>
        <p className="eyebrow">Before the first entry</p>
        <h1>Set an account password</h1>
        <p className="modal-copy">This protects the whole book. Choose a password you’ll remember — there’s no recovery if it’s lost.</p>
        <label className="field">
          <span>Password</span>
          <input type="password" autoFocus minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn" disabled={saving}>{saving ? "Saving…" : "Set password and continue"}</button>
      </form>
    </div>
  );
}

function LoginScreen() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (locked) return;
    setSaving(true);
    setError("");
    try {
      await login(password);
    } catch (err) {
      const cooldown = /30.minute|Wait \d+ minute/i.test(err.message);
      setLocked(cooldown);
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="panel auth-card" onSubmit={onSubmit}>
        <p className="eyebrow">Balancio</p>
        <h1>Sign in</h1>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
            disabled={locked || saving}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn" disabled={saving || locked}>
          {locked ? "Cooldown active" : saving ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
