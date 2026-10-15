import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Loader2, X, Image as ImageIcon, Mail, MailOpen, Trash2, Reply, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  subject: string;
  body: string;
  image_url: string | null;
  parent_id: string | null;
  read_at: string | null;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  is_admin: boolean;
}

export default function MessagesPage({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeImage, setComposeImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!fetchErr && data) setMessages(data as Message[]);
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, username, is_admin")
      .order("email", { ascending: true });
    if (data) {
      setAdminIds((data as UserProfile[]).filter((u) => u.is_admin).map((u) => u.id));
      setUsers(isAdmin ? (data as UserProfile[]).filter((u) => u.id !== user?.id) : []);
    }
  }, [isAdmin, user]);

  useEffect(() => { fetchMessages(); fetchUsers(); }, [fetchMessages, fetchUsers]);

  const handleSend = async () => {
    if (!composeBody.trim() && !composeImage) return;
    setSending(true);
    setError(null);
    try {
      let imageUrl: string | null = null;
      if (composeImage) {
        const ext = composeImage.name.split(".").pop() || "jpg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("message-images").upload(fileName, composeImage);
        if (upErr) throw new Error(upErr.message);
        const { data: urlData } = supabase.storage.from("message-images").getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
      }

      const { error: insErr } = await supabase.from("messages").insert({
        recipient_id: composeRecipient || null,
        subject: composeSubject.trim() || (composeRecipient ? "Direct message" : "Announcement"),
        body: composeBody.trim(),
        image_url: imageUrl,
      });
      if (insErr) throw new Error(insErr.message);

      setComposeBody(""); setComposeSubject(""); setComposeRecipient("");
      setComposeImage(null); setShowCompose(false);
      fetchMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleReply = async (parent: Message) => {
    if (!replyBody.trim() && !replyImage) return;
    setSendingReply(true);
    setError(null);
    try {
      let imageUrl: string | null = null;
      if (replyImage) {
        const ext = replyImage.name.split(".").pop() || "jpg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("message-images").upload(fileName, replyImage);
        if (upErr) throw new Error(upErr.message);
        const { data: urlData } = supabase.storage.from("message-images").getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;
      }

      const { error: insErr } = await supabase.from("messages").insert({
        recipient_id: parent.sender_id,
        subject: parent.subject.startsWith("Re:") ? parent.subject : `Re: ${parent.subject}`,
        body: replyBody.trim(),
        image_url: imageUrl,
        parent_id: parent.id,
      });
      if (insErr) throw new Error(insErr.message);

      setReplyBody(""); setReplyImage(null);
      fetchMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  const handleMarkRead = async (msg: Message) => {
    if (msg.read_at || msg.recipient_id !== user?.id) return;
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", msg.id);
    fetchMessages();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("messages").delete().eq("id", id);
    setSelectedMessage(null);
    fetchMessages();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>, setter: (f: File | null) => void) => {
    const file = e.target.files?.[0];
    if (file) setter(file);
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const senderName = (id: string) => {
    if (adminIds.includes(id)) return "Admin";
    if (id === user?.id) return "You";
    const u = users.find((u) => u.id === id);
    return u ? (u.username || u.email) : "Unknown";
  };

  const myMessages = messages.filter((m) => m.recipient_id === user?.id || m.sender_id === user?.id || (m.recipient_id === null && m.sender_id !== user?.id));
  const unreadCount = myMessages.filter((m) => m.recipient_id === user?.id && !m.read_at).length;

  // Thread view for selected message
  const thread = selectedMessage ? messages.filter((m) =>
    m.id === selectedMessage.id || m.parent_id === selectedMessage.id ||
    (selectedMessage.parent_id && m.id === selectedMessage.parent_id) ||
    (selectedMessage.parent_id && m.parent_id === selectedMessage.parent_id)
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : [];

  return (
    <div className="space-y-4">
      {previewImage && <div role="dialog" aria-label="Image preview" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={() => setPreviewImage(null)}><button type="button" aria-label="Close preview" className="absolute right-5 top-5 rounded-full bg-white p-2" onClick={() => setPreviewImage(null)}><X className="h-5 w-5" /></button><img src={previewImage} alt="Full-size attachment preview" className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} /></div>}
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Messages</h3>
            <p className="text-xs text-gray-400">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowCompose(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              <Send className="h-4 w-4" /> <span className="hidden sm:inline">New Message</span>
            </button>
          )}
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">New Message</h4>
            <button onClick={() => setShowCompose(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3">
            {isAdmin && users.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">Send to</label>
                <select value={composeRecipient} onChange={(e) => setComposeRecipient(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white">
                  <option value="">All users (broadcast)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.username || u.email}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Subject</label>
              <input type="text" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Message</label>
              <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Type your message..." rows={4}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
            </div>
            <div>
              <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 transition hover:border-gray-400 hover:bg-white">
                <ImageIcon className="h-4 w-4" />
                {composeImage ? composeImage.name : "Attach an image (optional)"}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImageSelect(e, setComposeImage)} className="hidden" />
              </label>
            </div>
            {composeImage && <button type="button" onClick={() => setPreviewImage(URL.createObjectURL(composeImage))} className="text-sm text-emerald-700 underline">Preview attached image</button>}
            <button onClick={handleSend} disabled={sending || (!composeBody.trim() && !composeImage)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send Message
            </button>
          </div>
        </div>
      )}

      {/* Message list / detail */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="mt-2 text-sm text-gray-400">Loading messages...</p>
        </div>
      ) : selectedMessage ? (
        <div className="space-y-3">
          <button onClick={() => setSelectedMessage(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" /> Back to messages
          </button>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-900">{selectedMessage.subject}</h4>
              {selectedMessage.sender_id === user?.id && (
                <button onClick={() => handleDelete(selectedMessage.id)}
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="space-y-4">
              {thread.map((msg) => (
                <div key={msg.id} className={`rounded-lg p-4 ${msg.sender_id === user?.id ? "bg-emerald-50" : "bg-gray-50"}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">{senderName(msg.sender_id)}</span>
                    <span className="text-xs text-gray-400">{formatDate(msg.created_at)}</span>
                  </div>
                  {msg.body && <p className="text-sm text-gray-700">{msg.body}</p>}
                  {msg.image_url && (
                    <button type="button" onClick={() => setPreviewImage(msg.image_url)} className="mt-2 block" title="Preview full-size image"><img src={msg.image_url} alt="Attachment (click to preview)" className="max-h-64 rounded-lg object-cover" /></button>
                  )}
                </div>
              ))}
            </div>

            {/* Reply box */}
            {selectedMessage.sender_id !== user?.id && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex flex-col gap-2">
                  <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply..." rows={3}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm outline-none focus:border-gray-400 focus:bg-white" />
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 transition hover:border-gray-400">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {replyImage ? replyImage.name : "Image"}
                      <input ref={replyFileRef} type="file" accept="image/*" onChange={(e) => handleImageSelect(e, setReplyImage)} className="hidden" />
                    </label>
                    {replyImage && <button type="button" onClick={() => setPreviewImage(URL.createObjectURL(replyImage))} className="text-xs text-emerald-700 underline">Preview</button>}
                    <button onClick={() => handleReply(selectedMessage)} disabled={sendingReply || (!replyBody.trim() && !replyImage)}
                      className="ml-auto flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50">
                      {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Reply className="h-4 w-4" />} Reply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : myMessages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
          <MessageSquare className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No messages yet</p>
          <p className="mt-1 text-xs text-gray-400">
            {isAdmin ? "Send a message to your users from the button above" : "Check back later for updates from your admin"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {myMessages.map((msg) => {
            const isIncoming = msg.recipient_id === user?.id || (msg.recipient_id === null && msg.sender_id !== user?.id);
            const isUnread = isIncoming && !msg.read_at;
            return (
              <button key={msg.id}
                onClick={() => { setSelectedMessage(msg); if (isUnread) handleMarkRead(msg); }}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition hover:shadow-md ${
                  isUnread ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-white"
                }`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isUnread ? "bg-emerald-600" : "bg-gray-100"}`}>
                  {isUnread ? <Mail className="h-4 w-4 text-white" /> : <MailOpen className="h-4 w-4 text-gray-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm ${isUnread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                      {msg.subject}
                    </p>
                    <span className="shrink-0 text-xs text-gray-400">{formatDate(msg.created_at)}</span>
                  </div>
                  <p className={`mt-0.5 truncate text-xs ${isUnread ? "text-gray-600" : "text-gray-400"}`}>
                    {isIncoming ? `From ${senderName(msg.sender_id)}` : `To ${msg.recipient_id ? senderName(msg.recipient_id) : "All users"}`}
                    {msg.body && ` · ${msg.body.slice(0, 60)}`}
                  </p>
                  {msg.image_url && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                      <ImageIcon className="h-3 w-3" /> Image attached
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
