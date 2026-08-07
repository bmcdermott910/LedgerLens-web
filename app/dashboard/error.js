'use client';

// Catches anything thrown while rendering the dashboard and shows a recoverable message
// instead of Next.js's raw "Application error: a server-side exception has occurred".
// Most of what lands here is transient -- a Supabase call that failed while auth cookies were
// still settling after sign-in -- so "Try again" usually is the fix.
export default function DashboardError({ error, reset }) {
  return (
    <div style={{ maxWidth: 560, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      <h2 style={{ color: '#0f2a4a', marginBottom: '0.5rem' }}>LedgerLens couldn’t load that view</h2>
      <p className="small-muted" style={{ marginTop: 0 }}>
        This is usually temporary — it often happens on the first page load right after signing in.
      </p>
      <button type="button" onClick={() => reset()} style={{ marginTop: '1rem' }}>
        Try again
      </button>
      <p className="small-muted" style={{ marginTop: '1.5rem' }}>
        If it keeps happening, send Brian McDermott the reference below.
      </p>
      {error?.digest && (
        <p className="small-muted" style={{ fontFamily: 'monospace' }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
