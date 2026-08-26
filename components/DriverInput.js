'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// A single shared budget driver. Click to edit, Enter or Save to commit; the page then refreshes
// so every figure downstream -- this tab, the 5 Year Trend columns, both runway charts --
// recomputes from the new value. Read-only for anyone who is not an admin, since the budget is
// a plan of record rather than personal scratch.
export default function DriverInput({
  payload, value, display, canEdit, width = 70, suffix = '',
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch('/api/budget-driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, value: Number(draft) }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Could not save');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!canEdit) return <span>{display}</span>;

  if (editing) {
    return (
      <span className="driver-edit">
        <input
          type="number"
          value={draft}
          autoFocus
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setEditing(false); setDraft(String(value ?? 0)); }
          }}
          style={{ width }}
        />
        {suffix}
        <button onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</button>
        <button onClick={() => { setEditing(false); setDraft(String(value ?? 0)); }} disabled={saving}>
          ×
        </button>
        {error && <span className="driver-error">{error}</span>}
      </span>
    );
  }

  return (
    <span
      className="driver-cell"
      title="Shared budget driver — click to change"
      onClick={() => setEditing(true)}
    >
      {display}
    </span>
  );
}
