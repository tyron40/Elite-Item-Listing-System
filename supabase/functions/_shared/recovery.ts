export const PROTOCOL_VERSION = 1;
export const TOOLKIT = {
  name: 'Ty Recovery USB — bootable PC toolkit',
  filename: 'Ty-Recovery-USB-amd64.iso',
  url: 'https://github.com/tyron40/Ty-Recovery-USB/releases/download/bootable-5/Ty-Recovery-USB-amd64.iso',
  release: 'https://github.com/tyron40/Ty-Recovery-USB/releases/tag/bootable-5',
  sha256: '053db68a071f4574234952d0163ea62e9df3ac50dee7959024718b946ec542c4',
  max_bytes: 536870912,
  purpose: 'Bootable live toolkit; not an operating-system installer or factory image.',
};
export type TargetOS = 'unknown' | 'windows' | 'macos' | 'chromeos' | 'linux';
export type CommandKind = 'scan' | 'download_toolkit' | 'reboot_firmware';
export type HardwareReport = {
  manufacturer: string; model: string; architecture: string; os: string; os_version: string;
  firmware_type: string; firmware_version: string; cpu: string; memory_gb: number | null;
  environment: string; firmware_restart: boolean; agent_version: string;
  disks: Array<{ name: string; size: string; transport: string; model: string }>;
};
export type RecoveryPlan = {
  title: string; summary: string; steps: string[]; source: string | null;
  toolkit: typeof TOOLKIT | null; firmwareAvailable: boolean;
};
const text = (v: unknown, max = 160) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
export function normalizeReport(input: unknown): HardwareReport {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A hardware report is required');
  const x = input as Record<string, unknown>;
  const disks = Array.isArray(x.disks) ? x.disks.slice(0, 16) : [];
  return {
    manufacturer: text(x.manufacturer), model: text(x.model), architecture: text(x.architecture, 40),
    os: text(x.os, 80), os_version: text(x.os_version), firmware_type: text(x.firmware_type, 40),
    firmware_version: text(x.firmware_version), cpu: text(x.cpu),
    memory_gb: typeof x.memory_gb === 'number' && Number.isFinite(x.memory_gb) && x.memory_gb >= 0 && x.memory_gb <= 1048576 ? x.memory_gb : null,
    environment: text(x.environment, 60), firmware_restart: x.firmware_restart === true,
    agent_version: text(x.agent_version, 40),
    disks: disks.filter(d => d && typeof d === 'object').map(d => ({
      name: text(d.name, 80), size: text(d.size, 40), transport: text(d.transport, 40), model: text(d.model),
    })),
  };
}
export function targetOS(input: unknown): TargetOS {
  if (!['unknown', 'windows', 'macos', 'chromeos', 'linux'].includes(String(input))) throw new Error('Choose a supported system');
  return input as TargetOS;
}
export function makePlan(report: HardwareReport, target: TargetOS): RecoveryPlan {
  const x64 = /^(x86_64|amd64|x64)$/i.test(report.architecture);
  const apple = /apple/i.test(report.manufacturer) || /darwin|macos/i.test(report.os);
  const restricted = /container|wsl|virtual/i.test(report.environment);
  const toolkit = x64 && !apple && target !== 'chromeos' && target !== 'macos' && !restricted ? TOOLKIT : null;
  const common = ['Confirm the manufacturer, exact model and architecture shown here. These are device-reported findings, not hardware attestation.',
    'Back up files and retain any disk-encryption recovery keys before choosing an erase operation.'];
  const routes: Record<TargetOS, { title: string; summary: string; source: string | null; steps: string[] }> = {
    unknown: { title: 'Confirm the original operating system', summary: 'A live USB reports its own Linux environment. It does not prove which OS is installed on the internal disk.', source: null,
      steps: ['Choose the original OS above. Do not guess a factory image from the brand alone.'] },
    windows: { title: 'Windows / manufacturer recovery', summary: 'The exact OEM recovery image is not verified. The PC toolkit below can boot independently; it does not contain Windows Setup.', source: /surface/i.test(report.model) ? 'https://support.microsoft.com/surface' : 'https://support.microsoft.com/windows',
      steps: ['Use the manufacturer recovery service for the exact model or obtain compatible official Windows installation media.', 'Verify image architecture, edition, drivers and the destination disk before installation.'] },
    macos: { title: 'Apple Recovery', summary: 'Use Apple-supported Recovery for this Mac. The generic PC ISO is not selected for a Mac recovery plan.', source: 'https://support.apple.com/102518',
      steps: ['Apple silicon: shut down, hold Power until startup options appear, then choose Options.', 'Intel Mac: start while holding Command-R. Credentials or the previous Apple Account may be required.'] },
    chromeos: { title: 'Model-specific ChromeOS recovery', summary: 'A ChromeOS image must match the exact recovery model/board. No generic PC ISO is selected.', source: 'https://support.google.com/chromebook/answer/1080595',
      steps: ['Read the recovery model identifier on the Chromebook recovery screen.', 'Use Google Recovery Utility or supported internet recovery. Preparing ChromeOS media can overwrite the whole USB drive.'] },
    linux: { title: 'Linux distribution recovery', summary: 'Choose the intended distribution and a compatible architecture. Reinstallation is different from restoring an OEM factory image.', source: 'https://ubuntu.com/desktop/docs/en/latest/tutorial/install-ubuntu-desktop/',
      steps: ['Obtain and verify the intended distribution installer from its official source. The linked Ubuntu guide applies only if you choose Ubuntu.', 'Try the live environment to confirm storage, keyboard and network support before installing.'] },
  };
  const route = routes[target];
  return { ...route, steps: [...common, ...route.steps, ...(toolkit ? ['Optional: download the verified PC toolkit. A downloaded ISO is not automatically selected as a boot device; write it to a separate USB or use an explicitly configured boot method.'] : [])],
    toolkit, firmwareAvailable: report.firmware_restart && !restricted && !apple && target !== 'chromeos' };
}
export function assistantReply(question: string, report: HardwareReport | null, plan: RecoveryPlan | null): string {
  if (!report || !plan) return 'Pair a computer using the companion, or import its hardware report. A browser cannot scan nearby computers or read BIOS on its own.';
  const q = question.toLowerCase();
  if (/bios|uefi|firmware/.test(q)) return `${report.firmware_type || 'Firmware type unavailable'}; firmware version: ${report.firmware_version || 'not reported'}. ${plan.firmwareAvailable ? 'You can request a UEFI restart. The companion requires local confirmation and sufficient privileges.' : 'A programmatic firmware restart is not available for this report. Consult the exact model’s startup instructions.'} Entering BIOS is usually unnecessary to read the manufacturer and model.`;
  if (/file|image|download|boot/.test(q)) return plan.toolkit ? `Selected optional boot file: ${plan.toolkit.filename}. SHA-256: ${plan.toolkit.sha256}. ${plan.toolkit.purpose} Downloading it alone does not change the boot order or install an OS.` : 'No compatible boot file is verified for this plan. Use the official recovery source shown in the plan; do not substitute a generic image.';
  if (/reset|erase|install|factory/.test(q)) return 'Disk erasure and OS installation are not implemented in this dashboard or companion. The plan identifies the official recovery route; any erase or installation must occur in the appropriate supported recovery tool.';
  if (/detect|model|brand|name|found/.test(q)) return `Reported computer: ${report.manufacturer || 'manufacturer unavailable'} ${report.model || 'model unavailable'}. Architecture: ${report.architecture || 'unknown'}. Running environment: ${report.os} (${report.environment || 'unknown'}). An empty or generic firmware model is not an exact model match.`;
  return `${plan.title}. ${plan.summary} Next: ${plan.steps.slice(0, 3).join(' ')}`;
}
