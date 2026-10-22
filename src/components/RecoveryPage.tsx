import { useState } from 'react';
import { Usb, Download, ShieldCheck, HardDrive, CheckCircle2 } from 'lucide-react';

const RECOVERY_BRANDS = [
  { name: 'Dell', terms: ['dell', 'alienware'], url: 'https://www.dell.com/support/home/en-us', key: 'F12', note: 'Use Service Tag to obtain model-specific recovery and drivers.' },
  { name: 'HP', terms: ['hp', 'hewlett', 'omen', 'pavilion', 'elitebook', 'probook'], url: 'https://support.hp.com/us-en', key: 'Esc, then F9', note: 'Use product number to locate the correct recovery media.' },
  { name: 'Lenovo', terms: ['lenovo', 'thinkpad', 'ideapad', 'legion'], url: 'https://pcsupport.lenovo.com/', key: 'F12 or Novo button', note: 'Use serial number to locate recovery options.' },
  { name: 'Microsoft Surface', terms: ['surface', 'microsoft'], url: 'https://support.microsoft.com/surface-recovery-image', key: 'Hold Volume Down while pressing Power', note: 'Select the exact Surface model and recovery image.' },
  { name: 'ASUS', terms: ['asus', 'rog', 'zenbook', 'vivobook'], url: 'https://www.asus.com/support/', key: 'Esc', note: 'Use the model number to locate official support downloads.' },
  { name: 'Acer', terms: ['acer', 'aspire', 'predator', 'nitro'], url: 'https://www.acer.com/us-en/support', key: 'F12 (may need enabling in BIOS)', note: 'Verify exact model and recovery requirements.' },
  { name: 'Apple Mac', terms: ['apple', 'macbook', 'imac', 'mac mini'], url: 'https://support.apple.com/mac', key: 'Apple silicon: hold Power; Intel: Option', note: 'Apple recovery often uses internet recovery or a Mac-specific installer.' },
  { name: 'Chromebook', terms: ['chromebook', 'chromeos'], url: 'https://support.google.com/chromebook/answer/1080595', key: 'Esc + Refresh + Power', note: 'Use Chromebook Recovery Utility and exact model; Windows ISOs are not interchangeable.' },
  { name: 'MSI', terms: ['msi'], url: 'https://www.msi.com/support', key: 'F11', note: 'Match the exact MSI model.' },
  { name: 'Samsung', terms: ['samsung', 'galaxy book'], url: 'https://www.samsung.com/us/support/', key: 'F10 (varies by model)', note: 'Verify model-specific boot menu and recovery media.' },
] as const;


export default function RecoveryPage() {
  const [description, setDescription] = useState('');
  const [os, setOs] = useState('windows11');
  const [searched, setSearched] = useState(false);
  const [usbReady, setUsbReady] = useState(false);
  const [flashed, setFlashed] = useState(false);
  const brand = RECOVERY_BRANDS.find(b => b.terms.some(t => description.toLowerCase().includes(t)));
  const windows = os === 'windows11' || os === 'windows10';
  const windowsLink = os === 'windows11' ? 'https://www.microsoft.com/software-download/windows11' : 'https://www.microsoft.com/software-download/windows10';
  const windowsLabel = os === 'windows11' ? 'Windows 11' : 'Windows 10';
  return <div className="mx-auto max-w-3xl space-y-5 pb-10">
    <section className="rounded-3xl bg-slate-950 p-7 text-white"><div className="flex items-center gap-3"><Usb className="h-8 w-8 text-emerald-300" /><h1 className="text-2xl font-bold">USB Recovery Preparation</h1></div><p className="mt-3 text-sm text-slate-300">Find the right recovery media and prepare a bootable USB in five guided steps.</p></section>
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">1. Identify your computer</h2>
      <label htmlFor="recovery-device" className="mt-3 block text-sm">Manufacturer and exact model</label>
      <input id="recovery-device" className="mt-1 w-full rounded-xl border px-4 py-3" placeholder="Example: HP EliteBook 840 G8" value={description} onChange={e => {setDescription(e.target.value);setSearched(false);setUsbReady(false);setFlashed(false);}} />
      <label htmlFor="recovery-os" className="mt-3 block text-sm">Operating system</label>
      <select id="recovery-os" className="mt-1 w-full rounded-xl border px-4 py-3" value={os} onChange={e => {setOs(e.target.value);setSearched(false);}}><option value="windows11">Windows 11</option><option value="windows10">Windows 10</option><option value="manufacturer">Manufacturer-specific recovery</option></select>
      <button disabled={!description.trim()} onClick={() => setSearched(true)} className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-40">Find recovery file</button>
    </section>
    {searched && <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">2. Download recovery media</h2>
      <p className="mt-2 text-sm text-gray-600">{brand ? `Detected manufacturer: ${brand.name}.` : 'Manufacturer not identified; check the exact model.'} {windows ? `Select official ${windowsLabel} installation media for compatible PCs.` : 'Manufacturer-specific images may require a serial number and cannot be selected reliably from a description alone.'}</p>
      {windows ? <><a href={windowsLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white"><Download className="h-4 w-4" /> Get official {windowsLabel} media</a><p className="mt-2 text-xs text-amber-800">Microsoft generates or controls its download links. This button opens Microsoft's official download process; no ISO is falsely claimed to be stored here.</p></> : brand ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A verified direct recovery image is not available in the site's catalog for this exact model. Do not use an unverified image.</p> : null}
    </section>}
    {searched && <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-bold"><Usb className="h-5 w-5" /> 3. Connect your USB</h2><p className="mt-2 text-sm text-gray-600">Connect a USB drive with sufficient capacity (8 GB or more for typical Windows media). Back up its files first: flashing will erase the drive.</p><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={usbReady} onChange={e=>{setUsbReady(e.target.checked);setFlashed(false);}} /> I connected and backed up my USB drive.</label></section>}
    {searched && usbReady && <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-bold"><HardDrive className="h-5 w-5" /> 4. Create the bootable USB</h2><p className="mt-2 text-sm text-gray-600">Use the official media creation utility or a trusted imaging application. Select the correct removable drive, confirm the erase warning, write the downloaded image and wait for verification.</p><p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">The website cannot detect raw USB disks or flash them without an installed, permissioned companion. Downloading a file does not make a USB bootable.</p><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={flashed} onChange={e=>setFlashed(e.target.checked)} /> My flashing tool confirmed completion.</label></section>}
    {searched && usbReady && flashed && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><h2 className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 className="h-5 w-5" /> 5. Boot from USB</h2><p className="mt-3 text-sm">Insert the USB into the target computer, power it on, and open its boot menu. {brand ? `${brand.name}: ${brand.key} (model dependent).` : 'Consult the manufacturer for the correct startup key.'} Select the USB device and follow the recovery instructions. Reinstallation may erase data.</p></section>}
    <p className="flex items-center gap-2 text-xs text-gray-500"><ShieldCheck className="h-4 w-4" /> Only official recovery sources. No automatic erasure or unverified downloads.</p>
  </div>;
}
