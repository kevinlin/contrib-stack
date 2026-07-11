"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { HANDLE_REGEX, RESERVED_HANDLES } from "@/lib/handle";

function validateHandleClient(handle: string): string | null {
  if (!HANDLE_REGEX.test(handle)) {
    return "Handle must be 3–30 characters: lowercase letters, numbers, and hyphens only.";
  }
  if (RESERVED_HANDLES.includes(handle as (typeof RESERVED_HANDLES)[number])) {
    return "That handle is reserved.";
  }
  return null;
}

export default function WelcomePage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validationError = validateHandleClient(handle);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/settings/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, timezone }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        if (data.error === "handle_taken") {
          setError("That handle is already taken.");
        } else if (data.error === "handle_immutable") {
          router.push(`/${handle}`);
        } else if (data.error === "reserved") {
          setError("That handle is reserved.");
        } else if (data.error === "invalid_format") {
          setError(
            "Handle must be 3–30 characters: lowercase letters, numbers, and hyphens only.",
          );
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }

      router.push(`/${handle}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "4rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>Welcome to ContribStack</h1>
      <p>Choose a public handle for your contribution profile.</p>
      <form onSubmit={onSubmit}>
        <label htmlFor="handle" style={{ display: "block", marginBottom: 8 }}>
          Handle
        </label>
        <input
          id="handle"
          name="handle"
          type="text"
          value={handle}
          onChange={(event) => setHandle(event.target.value.toLowerCase())}
          placeholder="your-handle"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9-]{3,30}"
          style={{ width: "100%", padding: 8, marginBottom: 16 }}
        />
        <input type="hidden" name="timezone" value={timezone} />
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
          Timezone detected: {timezone}
        </p>
        {error ? (
          <p role="alert" style={{ color: "#b00020", marginBottom: 16 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
          {submitting ? "Claiming…" : "Claim handle"}
        </button>
      </form>
    </main>
  );
}
