import { useState } from "react";
import { PackageSearch, Loader2, Lock, Mail, User as UserIcon, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (mode === "signin") {
      const { error: err } = await signIn(email.trim(), password);
      if (err) setError(err);
    } else {
      const { error: err } = await signUp(email.trim(), password);
      if (err) {
        setError(err);
      } else {
        setSuccess("Account created! You can now sign in.");
        setMode("signin");
        setPassword("");
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50/30 to-teal-50/40 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/30">
            <PackageSearch className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-wide text-gray-900">ELITE ITEM LISTING TOOL</h1>
          <p className="mt-1 text-sm text-gray-500">Identify, price & list</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-8 shadow-xl shadow-gray-200/50 backdrop-blur-sm">
          {/* Tab toggle */}
          <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => { setMode("signin"); setError(null); setSuccess(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${mode === "signin" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${mode === "signup" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Sign Up
            </button>
          </div>

          {success && (
            <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Admin hint */}
          <div className="mt-6 flex items-start gap-2.5 rounded-lg bg-gray-50 px-4 py-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-600">Admin Access</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Use email <code className="rounded bg-gray-200 px-1 text-gray-600">admin@admin.com</code> and password <code className="rounded bg-gray-200 px-1 text-gray-600">Admin123!@#secure</code> for the admin account.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setSuccess(null); }}
            className="font-medium text-emerald-600 hover:text-emerald-700"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
