import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReport, makePlan, assistantReply, targetOS } from '../supabase/functions/_shared/recovery.ts';
const base = normalizeReport({ manufacturer: 'Dell', model: 'OptiPlex test', architecture: 'AMD64', os: 'Windows', firmware_restart: true, environment: 'installed' });
test('x64 PC plan selects only the known boot toolkit', () => {
  const plan = makePlan(base, 'windows');
  assert.ok(plan.toolkit); assert.match(plan.toolkit!.sha256, /^[a-f0-9]{64}$/);
  assert.match(plan.toolkit!.purpose, /not an operating-system installer/);
});
test('Apple silicon, Intel Macs and ChromeOS never receive generic PC image', () => {
  assert.equal(makePlan({ ...base, manufacturer: 'Apple' }, 'macos').toolkit, null);
  assert.equal(makePlan({ ...base, architecture: 'arm64', manufacturer: 'Apple' }, 'macos').toolkit, null);
  assert.equal(makePlan(base, 'chromeos').toolkit, null);
});
test('ARM PCs and containers do not receive generic x64 file or firmware action', () => {
  assert.equal(makePlan({ ...base, architecture: 'ARM64' }, 'windows').toolkit, null);
  const plan = makePlan({ ...base, environment: 'container' }, 'windows');
  assert.equal(plan.toolkit, null); assert.equal(plan.firmwareAvailable, false);
});
test('live environment does not imply an installed OS', () => {
  assert.match(makePlan({ ...base, environment: 'live USB' }, 'unknown').summary, /does not prove/);
});
test('report schema drops serials, credentials and extra fields', () => {
  const report = normalizeReport({ ...base, serial_number: 'DO-NOT-COLLECT', token: 'SECRET', manufacturer: 'Dell\nBrand' });
  assert.equal('serial_number' in report, false); assert.equal('token' in report, false);
  assert.equal(report.manufacturer, 'Dell Brand');
});
test('malformed reports, oversized arrays and memory values are handled', () => {
  assert.throws(() => normalizeReport(null));
  const report = normalizeReport({ disks: Array(100).fill({ name: 'disk' }), memory_gb: Infinity });
  assert.equal(report.disks.length, 16); assert.equal(report.memory_gb, null);
});
test('unsupported target is refused', () => assert.throws(() => targetOS('execute shell')));
test('assistant grounds findings and does not offer erase execution', () => {
  const plan = makePlan(base, 'windows');
  assert.match(assistantReply('model detected?', base, plan), /OptiPlex test/);
  assert.match(assistantReply('erase everything', base, plan), /not implemented/);
  assert.match(assistantReply('detect PCs', null, null), /browser cannot/);
});
