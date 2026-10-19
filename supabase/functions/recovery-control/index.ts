import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { makePlan, normalizeReport, targetOS, PROTOCOL_VERSION } from '../_shared/recovery.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('');
const secret = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
const date = (ms: number) => new Date(Date.now() + ms).toISOString();
const fields = 'id,report,target_os,status,created_at,last_seen_at,expires_at';
const uuid = (x: unknown) => { if (typeof x !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)) throw new HttpError(400, 'Invalid session or request ID'); return x; };
const checked = <T>(result: { data: T; error: unknown }) => { if (result.error) throw new HttpError(500, 'Recovery storage operation failed'); return result.data; };
async function bodyOf(req: Request) {
  const reader = req.body?.getReader(); if (!reader) throw new HttpError(400, 'JSON body required');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new HttpError(413, 'Request too large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const body = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; } catch { throw new HttpError(400, 'Invalid JSON body'); }
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
  try {
    const body = await bodyOf(req); const op = body.op;
    if (op === 'health') return reply({ service: 'elite-recovery-control', protocol: PROTOCOL_VERSION });
    const url = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (op === 'device_claim') {
      if (typeof body.code !== 'string' || !/^[a-f0-9]{48}$/.test(body.code)) throw new HttpError(400, 'Invalid pairing code');
      const report = normalizeReport(body.report);
      const pair = checked(await db.from('recovery_pairings').update({ consumed_at: date(0) }).eq('code_hash', await hash(body.code)).is('consumed_at', null).gt('expires_at', date(0)).select('owner_id').maybeSingle());
      if (!pair) throw new HttpError(401, 'Pairing code expired or already used');
      const token = secret(32), expires = date(86400000);
      const session = checked(await db.from('recovery_sessions').insert({ owner_id: pair.owner_id, token_hash: await hash(token), report, expires_at: expires }).select('id').single());
      if (!session) throw new HttpError(500, 'Could not create device session');
      return reply({ session_id: session.id, token, expires_at: expires, protocol: PROTOCOL_VERSION });
    }
    if (['device_poll', 'device_progress', 'device_result'].includes(op)) {
      if (!/^[a-f0-9]{64}$/.test(bearer)) throw new HttpError(401, 'Device token required');
      const session = checked(await db.from('recovery_sessions').select('id,report,target_os').eq('token_hash', await hash(bearer)).eq('status', 'active').gt('expires_at', date(0)).maybeSingle());
      if (!session) throw new HttpError(401, 'Device session expired or disconnected');
      checked(await db.from('recovery_sessions').update({ last_seen_at: date(0) }).eq('id', session.id));
      if (op === 'device_poll') {
        const update = { last_seen_at: date(0), ...(body.report ? { report: normalizeReport(body.report) } : {}) };
        checked(await db.from('recovery_sessions').update(update).eq('id', session.id));
        checked(await db.from('recovery_commands').update({ status: 'expired', result: 'Request expired. Its outcome was not confirmed.', updated_at: date(0) }).eq('session_id', session.id).in('status', ['queued', 'dispatched']).lt('expires_at', date(0)));
        const next = checked(await db.from('recovery_commands').select('id,kind,payload,expires_at').eq('session_id', session.id).eq('status', 'queued').gt('expires_at', date(0)).order('created_at').limit(1).maybeSingle());
        if (!next) return reply({ command: null });
        const claimed = checked(await db.from('recovery_commands').update({ status: 'dispatched', updated_at: date(0) }).eq('id', next.id).eq('status', 'queued').select('id').maybeSingle());
        return reply({ command: claimed ? next : null });
      }
      const id = uuid(body.command_id);
      if (op === 'device_progress') {
        const percent = typeof body.percent === 'number' ? Math.min(100, Math.max(0, body.percent)) : 0;
        checked(await db.from('recovery_commands').update({ progress: { percent, message: String(body.message || '').slice(0, 200) }, updated_at: date(0) }).eq('id', id).eq('session_id', session.id).eq('status', 'dispatched').gt('expires_at', date(0)));
      } else {
        if (!['completed', 'failed', 'declined'].includes(body.status)) throw new HttpError(400, 'Invalid result status');
        checked(await db.from('recovery_commands').update({ status: body.status, result: String(body.result || '').slice(0, 2000), updated_at: date(0) }).eq('id', id).eq('session_id', session.id).eq('status', 'dispatched'));
      }
      return reply({ ok: true });
    }
    if (!bearer || bearer.length > 8192) throw new HttpError(401, 'Sign in required');
    const { data: { user }, error } = await db.auth.getUser(bearer);
    if (error || !user || user.is_anonymous) throw new HttpError(401, 'Sign in required');
    if (op === 'list') {
      const sessions = checked(await db.from('recovery_sessions').select(fields).eq('owner_id', user.id).order('created_at', { ascending: false }).limit(20)) || [];
      const ids = sessions.map(s => s.id);
      const commands = ids.length ? checked(await db.from('recovery_commands').select('id,session_id,kind,status,result,progress,created_at,expires_at').in('session_id', ids).order('created_at', { ascending: false }).limit(100)) : [];
      return reply({ sessions: sessions.map(s => ({ ...s, plan: makePlan(normalizeReport(s.report), targetOS(s.target_os)) })), commands });
    }
    if (op === 'create_pairing') {
      const { count, error: countError } = await db.from('recovery_pairings').select('id', { head: true, count: 'exact' }).eq('owner_id', user.id).gt('created_at', date(-60000));
      if (countError) throw new HttpError(500, 'Could not check pairing limit');
      if ((count || 0) >= 3) throw new HttpError(429, 'Wait one minute before creating another pairing code');
      const code = secret(24), expires = date(600000);
      checked(await db.from('recovery_pairings').insert({ owner_id: user.id, code_hash: await hash(code), expires_at: expires }));
      return reply({ code, expires_at: expires });
    }
    const id = uuid(body.session_id);
    const session = checked(await db.from('recovery_sessions').select('id,report,target_os,status,last_seen_at,expires_at').eq('id', id).eq('owner_id', user.id).maybeSingle());
    if (!session) throw new HttpError(404, 'Device not found');
    if (op === 'revoke') {
      checked(await db.from('recovery_sessions').update({ status: 'revoked' }).eq('id', id).eq('owner_id', user.id));
      checked(await db.from('recovery_commands').update({ status: 'expired', result: 'Device disconnected by owner' }).eq('session_id', id).eq('status', 'queued'));
      return reply({ ok: true });
    }
    if (session.status !== 'active' || new Date(session.expires_at).getTime() <= Date.now()) throw new HttpError(409, 'Device session is no longer active');
    if (op === 'set_target') {
      checked(await db.from('recovery_sessions').update({ target_os: targetOS(body.target_os) }).eq('id', id).eq('owner_id', user.id));
      return reply({ ok: true });
    }
    if (op === 'command') {
      if (Date.now() - new Date(session.last_seen_at).getTime() > 45000) throw new HttpError(409, 'Device is offline. Reconnect the companion first.');
      if (!['scan', 'download_toolkit', 'reboot_firmware'].includes(body.kind)) throw new HttpError(400, 'Unsupported request');
      const plan = makePlan(normalizeReport(session.report), targetOS(session.target_os));
      if (body.kind === 'download_toolkit' && !plan.toolkit) throw new HttpError(409, 'No compatible toolkit file is selected');
      if (body.kind === 'reboot_firmware' && !plan.firmwareAvailable) throw new HttpError(409, 'Firmware restart is not available for this device');
      checked(await db.from('recovery_commands').update({ status: 'expired', result: 'Request expired without a confirmed outcome' }).eq('session_id', id).in('status', ['queued','dispatched']).lt('expires_at', date(0)));
      const { data, error: insertError } = await db.from('recovery_commands').insert({ session_id: id, kind: body.kind, payload: body.kind === 'download_toolkit' ? plan.toolkit : {}, expires_at: date(body.kind === 'download_toolkit' ? 3600000 : 300000) }).select('id').single();
      if (insertError?.code === '23505') throw new HttpError(409, 'This computer already has an active request');
      if (insertError) throw new HttpError(500, 'Could not create device request');
      return reply({ id: data.id });
    }
    throw new HttpError(400, 'Unknown recovery operation');
  } catch (error) {
    if (error instanceof HttpError) return reply({ error: error.message }, error.status);
    return reply({ error: error instanceof Error && /hardware report|supported system/.test(error.message) ? error.message : 'Recovery request could not be completed' }, 400);
  }
});
