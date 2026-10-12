import { useCallback, useEffect, useState } from "react";
import { Users, Loader2, Trash2, Shield, ShieldCheck, Mail, Lock, X, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface AdminUser {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export default function AdminUsersPage({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to load users (${res.status})`);
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSave = async (userId: string) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          userId,
          email: editEmail.trim() || undefined,
          password: editPassword || undefined,
          isAdmin: editIsAdmin,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      setSaveMsg("User updated successfully");
      setEditingId(null);
      setEditPassword("");
      fetchUsers();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this user account? This cannot be undone.")) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?userId=${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEditEmail(user.email);
    setEditPassword("");
    setEditIsAdmin(user.is_admin);
    setSaveMsg(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">User Management</h3>
            <p className="text-xs text-gray-400">{users.length} registered users</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
      )}
      {saveMsg && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{saveMsg}</div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="mt-2 text-sm text-gray-400">Loading users...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="rounded-xl border border-gray-200 bg-white p-4">
              {editingId === user.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-400">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-400">New Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="Leave blank to keep"
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={editIsAdmin} onChange={(e) => setEditIsAdmin(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                    Admin access
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => handleSave(user.id)} disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
                    </button>
                    <button onClick={() => { setEditingId(null); setEditPassword(""); setSaveMsg(null); }}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${user.is_admin ? "bg-emerald-100" : "bg-gray-100"}`}>
                      {user.is_admin ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <Shield className="h-4 w-4 text-gray-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{user.email}</p>
                      <p className="text-xs text-gray-400">
                        {user.is_admin ? "Administrator" : "Standard user"} · Joined {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(user)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(user.id)}
                      className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
