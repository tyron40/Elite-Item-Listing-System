import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AdminUser {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!callerProfile?.is_admin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "GET") {
      const { data: profiles, error: profError } = await adminClient
        .from("profiles")
        .select("id, email, is_admin, created_at")
        .order("created_at", { ascending: true });

      if (profError) {
        return new Response(JSON.stringify({ error: profError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: authUsers, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const users: AdminUser[] = (profiles || []).map((p) => ({
        id: p.id,
        email: p.email,
        is_admin: p.is_admin,
        created_at: p.created_at,
      }));

      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const { userId, email, password, isAdmin } = body as {
        userId: string;
        email?: string;
        password?: string;
        isAdmin?: boolean;
      };

      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const updateData: Record<string, unknown> = {};
      if (email) updateData.email = email;
      if (password && password.length >= 6) updateData.password = password;

      if (Object.keys(updateData).length > 0) {
        const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, updateData);
        if (updateErr) {
          return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (email) {
          await adminClient.from("profiles").update({ email }).eq("id", userId);
        }
      }

      if (typeof isAdmin === "boolean") {
        if (!isAdmin && userId === user.id) {
          return new Response(JSON.stringify({ error: "Cannot remove your own admin status" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { error: profErr } = await adminClient.from("profiles").update({ is_admin: isAdmin }).eq("id", userId);
        if (profErr) {
          return new Response(JSON.stringify({ error: profErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      return new Response(JSON.stringify({ message: "User updated successfully" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const userId = url.searchParams.get("userId");

      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (userId === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete your own account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ message: "User deleted successfully" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
