"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PRESET_PALETTE } from "@/lib/colors";
import styles from "./page.module.css";

type ConnectionType = "github" | "gitlab" | "ingest";

type Connection = {
  id: string;
  slug: string;
  type: ConnectionType;
  label: string;
  color: string;
  baseUrl: string | null;
  status: "ok" | "backfilling" | "error";
  lastSyncedAt: string | null;
  createdAt: string;
};

type NewConnectionForm = {
  type: ConnectionType;
  label: string;
  baseUrl: string;
  token: string;
};

const TYPE_LABELS: Record<ConnectionType, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  ingest: "Ingest API",
};

const STATUS_LABELS: Record<Connection["status"], string> = {
  ok: "OK",
  backfilling: "Backfilling",
  error: "Error",
};

const emptyForm: NewConnectionForm = {
  type: "github",
  label: "",
  baseUrl: "",
  token: "",
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [form, setForm] = useState<NewConnectionForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiKeyReveal, setApiKeyReveal] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    const res = await fetch("/api/settings/connections");
    if (res.status === 401) {
      window.location.href = "/api/auth/signin?callbackUrl=/settings";
      return;
    }
    if (!res.ok) {
      throw new Error("Failed to load connections");
    }
    const data = (await res.json()) as { connections: Connection[] };
    setConnections(data.connections);
  }, []);

  const loadPrivacy = useCallback(async () => {
    const res = await fetch("/api/settings/privacy");
    if (res.status === 401) {
      window.location.href = "/api/auth/signin?callbackUrl=/settings";
      return;
    }
    if (res.ok) {
      const data = (await res.json()) as { isPrivate: boolean };
      setIsPrivate(data.isPrivate);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        await Promise.all([loadConnections(), loadPrivacy()]);
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [loadConnections, loadPrivacy]);

  useEffect(() => {
    const hasBackfilling = connections.some((c) => c.status === "backfilling");
    if (!hasBackfilling) {
      return;
    }

    const interval = setInterval(() => {
      void loadConnections();
    }, 3000);

    return () => clearInterval(interval);
  }, [connections, loadConnections]);

  async function onTogglePrivacy() {
    setPrivacySaving(true);
    try {
      const res = await fetch("/api/settings/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: !isPrivate }),
      });
      if (!res.ok) {
        throw new Error("Failed to update privacy");
      }
      const data = (await res.json()) as { isPrivate: boolean };
      setIsPrivate(data.isPrivate);
    } catch {
      setFormError("Failed to update privacy setting.");
    } finally {
      setPrivacySaving(false);
    }
  }

  async function onCreateConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const body: Record<string, string> = {
        type: form.type,
        label: form.label.trim(),
      };
      if (form.baseUrl.trim()) {
        body.baseUrl = form.baseUrl.trim();
      }
      if (form.type !== "ingest") {
        body.token = form.token;
      }

      const res = await fetch("/api/settings/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        error?: string;
        apiKey?: string;
        connection?: Connection;
      };

      if (!res.ok) {
        setFormError(data.error ?? "Failed to create connection.");
        return;
      }

      if (data.apiKey) {
        setApiKeyReveal(data.apiKey);
      }

      setForm(emptyForm);
      await loadConnections();
    } catch {
      setFormError("Failed to create connection.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteConnection(id: string) {
    if (!confirm("Delete this connection and all its data?")) {
      return;
    }

    const res = await fetch(`/api/settings/connections/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadConnections();
    }
  }

  async function onResyncConnection(id: string) {
    const res = await fetch(`/api/settings/connections/${id}`, {
      method: "POST",
    });
    if (res.ok) {
      await loadConnections();
    }
  }

  async function onUpdateColor(id: string, color: string) {
    const res = await fetch(`/api/settings/connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (res.ok) {
      setEditingColor(null);
      await loadConnections();
    }
  }

  const errorConnections = connections.filter((c) => c.status === "error");
  const backfillingConnections = connections.filter(
    (c) => c.status === "backfilling",
  );

  if (loading) {
    return (
      <main className={styles.main}>
        <p className={styles.loading}>Loading settings…</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Settings</h1>
        <p className={styles.subtitle}>
          Manage your connections and profile visibility.
        </p>
      </header>

      {errorConnections.length > 0 ? (
        <div className={styles.bannerError} role="alert">
          <strong>Connection errors</strong>
          <ul>
            {errorConnections.map((c) => (
              <li key={c.id}>
                {c.label}: token may be invalid or the source API is
                unreachable. Your profile still shows cached data.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {backfillingConnections.length > 0 ? (
        <div className={styles.bannerInfo} role="status">
          Backfilling history for{" "}
          {backfillingConnections.map((c) => c.label).join(", ")}…
        </div>
      ) : null}

      <section className={styles.section}>
        <h2>Privacy</h2>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            role="switch"
            checked={isPrivate}
            disabled={privacySaving}
            onChange={() => void onTogglePrivacy()}
          />
          <span>
            Private profile
            <span className={styles.hint}>
              When enabled, your profile and embed are hidden from public view.
            </span>
          </span>
        </label>
      </section>

      <section className={styles.section}>
        <h2>Connections</h2>

        {connections.length === 0 ? (
          <p className={styles.empty}>No connections yet.</p>
        ) : (
          <ul className={styles.connectionList}>
            {connections.map((connection) => (
              <li key={connection.id} className={styles.connectionCard}>
                <div className={styles.connectionHeader}>
                  <span
                    className={styles.colorSwatch}
                    style={{ backgroundColor: connection.color }}
                    aria-hidden
                  />
                  <div className={styles.connectionMeta}>
                    <strong>{connection.label}</strong>
                    <span className={styles.connectionType}>
                      {TYPE_LABELS[connection.type]} · {connection.slug}
                    </span>
                  </div>
                  <span
                    className={`${styles.badge} ${styles[`badge_${connection.status}`]}`}
                  >
                    {STATUS_LABELS[connection.status]}
                  </span>
                </div>

                {connection.baseUrl ? (
                  <p className={styles.baseUrl}>{connection.baseUrl}</p>
                ) : null}

                <div className={styles.connectionActions}>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() =>
                      setEditingColor(
                        editingColor === connection.id ? null : connection.id,
                      )
                    }
                  >
                    Color
                  </button>
                  {connection.type !== "ingest" ? (
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => void onResyncConnection(connection.id)}
                    >
                      Resync
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.buttonDanger}
                    onClick={() => void onDeleteConnection(connection.id)}
                  >
                    Delete
                  </button>
                </div>

                {editingColor === connection.id ? (
                  <div className={styles.colorPicker}>
                    {PRESET_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={styles.colorOption}
                        style={{ backgroundColor: color }}
                        aria-label={`Set color ${color}`}
                        aria-pressed={connection.color === color}
                        onClick={() =>
                          void onUpdateColor(connection.id, color)
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <form className={styles.form} onSubmit={onCreateConnection}>
          <h3>Add connection</h3>

          <label className={styles.field}>
            Type
            <select
              value={form.type}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  type: e.target.value as ConnectionType,
                }))
              }
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="ingest">Ingest API</option>
            </select>
          </label>

          <label className={styles.field}>
            Label
            <input
              type="text"
              value={form.label}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, label: e.target.value }))
              }
              placeholder="GitHub (personal)"
              required
            />
          </label>

          {form.type !== "ingest" ? (
            <>
              <label className={styles.field}>
                Base URL (optional, for self-hosted)
                <input
                  type="url"
                  value={form.baseUrl}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, baseUrl: e.target.value }))
                  }
                  placeholder="https://gitlab.example.com"
                />
              </label>

              <label className={styles.field}>
                Personal access token
                <input
                  type="password"
                  value={form.token}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, token: e.target.value }))
                  }
                  required
                  autoComplete="off"
                />
              </label>
            </>
          ) : (
            <p className={styles.hint}>
              Ingest connections receive a one-time API key after creation.
            </p>
          )}

          {formError ? (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            className={styles.buttonPrimary}
            disabled={submitting}
          >
            {submitting ? "Adding…" : "Add connection"}
          </button>
        </form>
      </section>

      {apiKeyReveal ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-labelledby="api-key-title"
        >
          <div className={styles.modal}>
            <h3 id="api-key-title">Ingest API key</h3>
            <p className={styles.hint}>
              Copy this key now. It will not be shown again.
            </p>
            <code className={styles.apiKey}>{apiKeyReveal}</code>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => {
                  void navigator.clipboard.writeText(apiKeyReveal);
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => setApiKeyReveal(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
