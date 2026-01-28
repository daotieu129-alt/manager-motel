import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getSession } from "../lib/auth";
import type { ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await getSession();
      setAuthed(!!data.session);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;
  if (!authed) return <Navigate to="/" replace />;

  return <>{children}</>;
}
