import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, Bot, CheckCircle2, Copy, Cpu, Download, FileJson, HardDrive, Loader2, Monitor, PlugZap, RefreshCw, Send, ShieldCheck, Terminal, Unplug, Usb, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { assistantReply, makePlan, normalizeReport, TOOLKIT, type HardwareReport, type RecoveryPlan, type TargetOS, type CommandKind } from '../../supabase/functions/_shared/recovery';

type Device = { id: string; report: HardwareReport; target_os: TargetOS; status: string; created_at: string; last_seen_at: string; expires_at: string; plan: RecoveryPlan };
type Command = { id: string; session_id: string; kind: CommandKind; status: string; result: string | null; progress: { percent: number; message: string } | null; created_at: string; expires_at: string };
async function api<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in again to use Recovery Studio.');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recovery-control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Recovery request failed.');
  return result;
}
const label = (command: CommandKind) => ({ scan: 'Hardware rescan', download_toolkit: 'Toolkit download', reboot_firmware: 'UEFI restart request' })[command];
const targets: Array<{ value: TargetOS; label: string }> = [{ value: 'unknown', label: 'Choose original operating system' }, { value: 'windows', label: 'Windows / Surface' }, { value: 'macos', label: 'macOS' }, { value: 'chromeos', label: 'ChromeOS' }, { value: 'linux', label: 'Linux' }];

export default function RecoveryPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [imported, setImported] = useState<HardwareReport | null>(null);
  const [importedTarget, setImportedTarget] = useState<TargetOS>('unknown');
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'you' | 'assistant'; text: string }>>([]);
  const inputFile = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await api<{ sessions: Device[]; commands: Command[] }>({ op: 'list' });
      if (!mounted.current) return;
      setDevices(data.sessions); setCommands(data.commands); setError('');
      setSelectedId(previous => previous || data.sessions[0]?.id || '');
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Could not load connected devices.'); }
    finally { inFlight.current = false; if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void load();
    const timer = window.setInterval(() => { setNow(Date.now()); void load(); }, 5000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [load]);
  useEffect(() => { setChat([]); setConfirmRestart(false); }, [selectedId]);
  const selected = devices.find(device => device.id === selectedId);
  const report = selectedId === 'import' ? imported : selected?.report || null;
  const target = selectedId === 'import' ? importedTarget : selected?.target_os || 'unknown';
  const plan = report ? selectedId === 'import' ? makePlan(report, target) : selected?.plan || makePlan(report, target) : null;
  const isOnline = (device: Device) => device.status === 'active' && new Date(device.expires_at).getTime() > now && now - new Date(device.last_seen_at).getTime() < 45000;
  const online = selected ? isOnline(selected) : false;
  const deviceCommands = commands.filter(command => command.session_id === selectedId);
  const active = deviceCommands.find(command => ['queued', 'dispatched'].includes(command.status) && new Date(command.expires_at).getTime() > now);
  const doAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusy(''); }
  };
  const request = (kind: CommandKind) => doAction(kind, async () => {
    if (!selected) return;
    await api({ op: 'command', session_id: selected.id, kind });
    setNotice(kind === 'scan' ? 'Rescan requested. The companion will send fresh findings.' : 'Request sent. Approve it in the companion window on that computer.');
    setConfirmRestart(false); await load();
  });
  const ask = (value: string) => {
    const text = value.trim(); if (!text) return;
    setChat(previous => [...previous, { role: 'you' as const, text: text.slice(0, 1000) }, { role: 'assistant' as const, text: assistantReply(text, report, plan) }].slice(-30));
    setQuestion('');
  };
  const importReport = async (file?: File) => {
    if (!file) return;
    await doAction('import', async () => {
      if (file.size > 65536) throw new Error('Choose a hardware-report JSON file smaller than 64 KB.');
      setImported(normalizeReport(JSON.parse(await file.text()))); setSelectedId('import'); setImportedTarget('unknown');
      setNotice('Local report imported. This is an offline preview; device requests require a paired companion.');
    });
    if (inputFile.current) inputFile.current.value = '';
  };
  const commandDisabled = !online || !!busy || !!active;
  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
      <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300"><Usb className="h-4 w-4" /> Elite device tools</div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Recovery Studio</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Know the computer. Understand the next step. Pair a companion to see hardware findings and prepare a verified recovery toolkit.</p></div>
        <div className="flex shrink-0 flex-col gap-3"><a href={TOOLKIT.release} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-300"><Download className="h-4 w-4" /> Bootable USB download</a><span className="text-center text-xs text-slate-400">Intel/AMD 64-bit PC toolkit · BIOS + UEFI</span></div>
      </div>
      <div className="relative mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">{[{ icon: PlugZap, title: '01 / Pair', text: 'Connect an authorized companion' }, { icon: Cpu, title: '02 / Identify', text: 'Read reported hardware details' }, { icon: ShieldCheck, title: '03 / Prepare', text: 'Review the route and verified file' }].map(item => <div key={item.title} className="flex items-center gap-3"><item.icon className="h-5 w-5 text-emerald-300" /><div><p className="text-sm font-semibold">{item.title}</p><p className="text-xs text-slate-400">{item.text}</p></div></div>)}</div>
    </section>
    {error && <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}
    <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Your computers</h2><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{devices.filter(isOnline).length} online</span></div>
          <div className="mt-4 space-y-2">{loading ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading devices</p> : devices.length === 0 && !imported ? <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center"><Monitor className="mx-auto h-8 w-8 text-gray-300" /><p className="mt-2 text-sm font-medium text-gray-600">No computers paired</p><p className="mt-1 text-xs leading-5 text-gray-400">Create a code below, then enter it in the companion on the target computer.</p></div> : null}
            {devices.map(device => <button key={device.id} onClick={() => setSelectedId(device.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === device.id ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 hover:bg-gray-50'}`}><p className="truncate text-sm font-semibold text-gray-900">{device.report.model || 'Model unavailable'}</p><p className="mt-1 truncate text-xs text-gray-500">{device.report.manufacturer || 'Manufacturer unavailable'}</p><p className={`mt-2 flex items-center gap-1.5 text-xs ${isOnline(device) ? 'text-emerald-700' : 'text-gray-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${isOnline(device) ? 'bg-emerald-500' : 'bg-gray-300'}`} />{device.status === 'revoked' ? 'Disconnected' : new Date(device.expires_at).getTime() <= now ? 'Session expired' : isOnline(device) ? 'Companion online' : 'Offline'}</p></button>)}
            {imported && <button onClick={() => setSelectedId('import')} className={`w-full rounded-xl border p-3 text-left text-sm ${selectedId === 'import' ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}><FileJson className="mb-2 h-4 w-4 text-blue-600" />{imported.model || 'Imported report'}<p className="mt-1 text-xs text-gray-500">Offline preview</p></button>}
          </div>
          <button disabled={!!busy} onClick={() => doAction('pair', async () => { setPairing(await api({ op: 'create_pairing' })); })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy === 'pair' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Pair a computer</button>
          {pairing && <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-gray-700">{new Date(pairing.expires_at).getTime() > now ? 'One-time pairing code' : 'Code expired — create a new one'}</p><code className="mt-2 block break-all text-xs leading-5 text-slate-700">{pairing.code}</code><button disabled={new Date(pairing.expires_at).getTime() <= now} onClick={() => doAction('copy', async () => { await navigator.clipboard.writeText(pairing.code); setNotice('Pairing code copied. Paste it only into the companion you intend to connect.'); })} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-40"><Copy className="h-3 w-3" />Copy code</button><p className="mt-2 text-[11px] text-gray-500">Expires {new Date(pairing.expires_at).toLocaleTimeString()}. Pair only devices you own or service with permission.</p></div>}
          <input ref={inputFile} type="file" accept=".json,application/json" className="hidden" aria-label="Import hardware report" onChange={e => void importReport(e.target.files?.[0])} />
          <button onClick={() => inputFile.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"><FileJson className="h-4 w-4" /> Import a local report</button>
        </div>
        <details className="rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-sm" open={!report}><summary className="cursor-pointer font-semibold text-slate-800">Connect without terminal commands</summary><ol className="mt-3 list-decimal space-y-3 pl-4 text-xs leading-5 text-gray-600"><li><strong>Cannot sign in?</strong> Use the bootable USB on a supported Intel/AMD PC. The graphical edition opens its pairing window after boot. If its printed address mentions the old site, use this GitHub Pages address instead. Select USB in the computer’s boot menu if needed.</li><li><strong>Already signed in?</strong> <a href={`${import.meta.env.BASE_URL}recovery/Elite-Recovery-Companion.zip`} download className="font-semibold text-emerald-700 underline">Download the graphical companion</a>, extract all files, and open recovery-gui.pyw with Python 3 and Tk installed. This is a source helper; it requires a working graphical Python file association.</li><li>Create a code here, paste it into the companion window, and approve sharing the displayed hardware report.</li><li>Keep the window open. Approve downloads and firmware restarts using its buttons. On the graphical USB, use its network settings button to connect first.</li></ol><p className="mt-3 text-xs leading-5 text-gray-500">The website cannot start a computer or enter BIOS on its own. This version identifies hardware and prepares verified recovery media; automatic disk erasure and operating-system installation are not implemented. Apple and Chromebook recovery use their official model-specific routes.</p></details>
      </aside>
      <div className="min-w-0 space-y-5">
        {!report || !plan ? <section className="flex min-h-[390px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm"><div className="rounded-2xl bg-emerald-50 p-5"><Monitor className="h-12 w-12 text-emerald-500" /></div><h2 className="mt-5 text-xl font-bold text-slate-900">A clear view of every recovery</h2><p className="mt-3 max-w-md text-sm leading-6 text-gray-500">Pair a companion to see the computer’s reported brand, exact model, firmware and architecture. The assistant will explain the supported route before you prepare any file.</p><div className="mt-6 flex items-center gap-2 text-xs font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> Account-scoped pairing · No automatic disk erasure</div></section> : <>
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Device findings</p><h2 className="mt-1 text-xl font-bold text-slate-900">{report.manufacturer || 'Unknown manufacturer'} {report.model || '— model not reported'}</h2><p className="mt-1 text-xs text-gray-500">{selectedId === 'import' ? 'Imported report · offline preview' : `Device-reported · last seen ${selected ? new Date(selected.last_seen_at).toLocaleTimeString() : ''}`}</p></div><button disabled={commandDisabled} onClick={() => request('scan')} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /> Rescan</button></div><dl className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">{[['Manufacturer', report.manufacturer], ['Exact model', report.model], ['Architecture', report.architecture], ['Processor', report.cpu], ['Running environment', `${report.os} · ${report.environment}`], ['OS version', report.os_version], ['Firmware type', report.firmware_type], ['Firmware version', report.firmware_version], ['Memory', report.memory_gb === null ? '' : `${report.memory_gb} GB`]].map(([key, value]) => <div key={key}><dt className="text-xs text-gray-400">{key}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{value || 'Not reported'}</dd></div>)}</dl>{report.disks.length > 0 && <details className="border-t border-gray-100 p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Reported disks ({report.disks.length})</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-gray-400"><tr><th className="py-2 pr-3">Device</th><th className="pr-3">Model</th><th className="pr-3">Bytes</th><th>Connection</th></tr></thead><tbody>{report.disks.map((disk, index) => <tr key={`${disk.name}-${index}`} className="border-t border-gray-100"><td className="py-2 pr-3">{disk.name}</td><td className="pr-3">{disk.model || 'Unknown'}</td><td className="pr-3">{disk.size}</td><td>{disk.transport || 'Unknown'}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-gray-500">Inventory only. No destination disk is selected or erased.</p></details>}</section>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><h2 className="font-bold text-slate-900">Recovery plan</h2></div><label className="mt-4 block text-xs font-semibold text-gray-600" htmlFor="original-os">Original operating system</label><select id="original-os" value={target} disabled={!!busy || (selectedId !== 'import' && selected?.status !== 'active')} onChange={e => { const value = e.target.value as TargetOS; if (selectedId === 'import') setImportedTarget(value); else void doAction('target', async () => { await api({ op: 'set_target', session_id: selectedId, target_os: value }); await load(); }); }} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none focus:border-emerald-400">{targets.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><h3 className="mt-5 font-semibold text-slate-900">{plan.title}</h3><p className="mt-2 text-sm leading-6 text-gray-500">{plan.summary}</p><ol className="mt-4 space-y-3">{plan.steps.map((step, i) => <li key={step} className="flex gap-3 text-sm leading-6 text-gray-600"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700">{i + 1}</span>{step}</li>)}</ol>{plan.source && <a href={plan.source} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">Official recovery instructions <ArrowRight className="h-4 w-4" /></a>}
            {plan.toolkit ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"><p className="flex items-center gap-2 text-sm font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4" /> Selected optional boot file</p><p className="mt-2 break-all text-sm font-semibold text-slate-800">{plan.toolkit.filename}</p><p className="mt-1 text-xs leading-5 text-gray-500">{plan.toolkit.purpose}</p><p className="mt-3 text-[11px] font-semibold uppercase text-gray-500">Expected SHA-256</p><code className="mt-1 block break-all text-[11px] leading-5 text-slate-600">{plan.toolkit.sha256}</code><button disabled={commandDisabled} onClick={() => request('download_toolkit')} className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"><ArrowDownToLine className="h-4 w-4" />Request download on device</button><p className="mt-2 text-xs text-gray-500">Requires an online companion and local approval. The companion verifies the actual bytes before keeping the file.</p></div> : <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">No compatible boot file is verified for this plan. Use the official, model-specific recovery route above.</div>}
            <div className="mt-5 border-t border-gray-100 pt-4"><button disabled={commandDisabled || !plan.firmwareAvailable} onClick={() => setConfirmRestart(true)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-700 disabled:opacity-40"><Terminal className="h-4 w-4" />Request restart into UEFI</button><p className="mt-2 text-xs leading-5 text-gray-500">{plan.firmwareAvailable ? 'The companion reports firmware restart capability. Save work; local approval is required. Firmware support is not guaranteed.' : 'Firmware restart is unavailable or has not been established. You usually do not need BIOS to identify the model.'}</p>{confirmRestart && <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>Request a restart of <strong>{report.manufacturer} {report.model}</strong> into firmware settings? Save open work on that computer. The companion must confirm locally.</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => request('reboot_firmware')} disabled={!!busy} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">Send restart request</button><button onClick={() => setConfirmRestart(false)} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold">Cancel</button></div></div>}</div>
          </section>
          {selected && <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold text-slate-900"><Activity className="h-4 w-4 text-emerald-600" /> Device activity</h2><button disabled={!!busy || selected.status === 'revoked'} onClick={() => doAction('disconnect', async () => { await api({ op: 'revoke', session_id: selected.id }); await load(); setNotice('Device session disconnected. Pair again to reconnect.'); })} className="flex items-center gap-1.5 text-xs text-gray-500 disabled:opacity-40"><Unplug className="h-3.5 w-3.5" />Disconnect</button></div>{deviceCommands.length === 0 ? <p className="mt-3 text-sm text-gray-400">No device requests yet.</p> : <div className="mt-4 space-y-3">{deviceCommands.slice(0, 8).map(command => <div key={command.id} className="rounded-xl bg-gray-50 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold text-slate-700">{label(command.kind)}</p><span className="text-xs text-gray-500">{['queued','dispatched'].includes(command.status) && new Date(command.expires_at).getTime() <= now ? 'Expired — outcome unconfirmed' : command.status === 'dispatched' ? 'On device / awaiting local approval' : command.status}</span></div>{command.progress && <div className="mt-2"><p className="text-xs text-gray-500">{command.progress.message} · {Math.round(command.progress.percent)}%</p><progress value={command.progress.percent} max={100} className="mt-1 h-1.5 w-full accent-emerald-500" aria-label="Download progress" /></div>}{command.result && <p className="mt-2 break-words text-xs leading-5 text-gray-500">{command.result}</p>}</div>)}</div>}</section>}
        </>}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="flex gap-3 border-b border-gray-100 p-5"><div className="rounded-xl bg-emerald-50 p-2.5"><Bot className="h-5 w-5 text-emerald-600" /></div><div><h2 className="font-bold text-slate-900">Recovery assistant</h2><p className="mt-1 text-xs text-gray-400">Answers from reported findings and the selected plan. It does not execute chat instructions.</p></div></div><div aria-live="polite" className="max-h-96 space-y-3 overflow-y-auto p-5"><div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-gray-600">{report && plan ? `${plan.title}. ${plan.summary}` : 'Pair a computer or import a report. I can explain its model, firmware, selected boot file and next steps.'}</div>{chat.map((entry, index) => <div key={index} className={`rounded-xl p-4 text-sm leading-6 ${entry.role === 'you' ? 'ml-6 bg-emerald-50 text-emerald-950' : 'mr-6 bg-slate-50 text-gray-600'}`}><p className="mb-1 text-[11px] font-bold uppercase tracking-wider">{entry.role === 'you' ? 'You' : 'Assistant'}</p><p className="break-words">{entry.text}</p></div>)}</div><div className="flex flex-wrap gap-2 px-5 pb-3">{['What did you detect?', 'Which boot file?', 'Can I enter BIOS?', 'What happens next?'].map(prompt => <button key={prompt} onClick={() => ask(prompt)} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-emerald-300 hover:text-emerald-700">{prompt}</button>)}</div><form onSubmit={e => { e.preventDefault(); ask(question); }} className="flex gap-2 border-t border-gray-100 p-4"><input aria-label="Ask the recovery assistant" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} placeholder="Ask about the findings or next step…" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none focus:border-emerald-400" /><button disabled={!question.trim()} aria-label="Send question" className="rounded-xl bg-emerald-600 px-4 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button></form></section>
      </div>
    </div>
    <p className="flex gap-2 px-1 text-xs leading-5 text-gray-400"><HardDrive className="mt-0.5 h-4 w-4 shrink-0" />This version pairs devices, reports hardware, downloads a verified PC toolkit and requests supported firmware restarts. It does not erase disks, install an OS or bypass device locks. Macs, Chromebooks and ARM PCs require their own compatible recovery method.</p>
  </div>;
}
