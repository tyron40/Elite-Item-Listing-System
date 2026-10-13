import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface AuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  username: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithUsername: (username: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ error: string | null }>;
  signUpWithUsername: (username: string, password: string, email?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}>({
  user: null,
  session: null,
  isAdmin: false,
  username: null,
  loading: true,
  signIn: async () => ({ error: "Not implemented" }),
  signInWithUsername: async () => ({ error: "Not implemented" }),
  signUp: async () => ({ error: "Not implemented" }),
  signUpWithUsername: async () => ({ error: "Not implemented" }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_admin, username")
      .eq("id", userId)
      .maybeSingle();
    setIsAdmin(prof?.is_admin ?? false);
    setUsername(prof?.username ?? null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        (async () => {
          await loadProfile(data.session!.user.id);
          setLoading(false);
        })();
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      (async () => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await loadProfile(newSession.user.id);
        } else {
          setIsAdmin(false);
          setUsername(null);
        }
        setLoading(false);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signInWithUsername = async (uname: string, password: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uname, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Login failed" };
      }
      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      return { error: error?.message ?? null };
    } catch {
      return { error: "Login failed. Please try again." };
    }
  };

  const signUp = async (email: string, password: string, uname?: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (uname && data.user) {
      await supabase.from("profiles").update({ username: uname }).eq("id", data.user.id);
    }
    return { error: null };
  };

  const signUpWithUsername = async (uname: string, password: string, email?: string) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uname, password, email: email || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || "Sign up failed" };
      }
      if (data.access_token) {
        const { error } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        return { error: error?.message ?? null };
      }
      return { error: "Account created. Please sign in." };
    } catch {
      return { error: "Sign up failed. Please try again." };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, username, loading, signIn, signInWithUsername, signUp, signUpWithUsername, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
