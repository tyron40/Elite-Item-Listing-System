#!/usr/bin/env python3
"""Elite Recovery companion: explicit pairing, read-only reports, verified download,
and locally confirmed UEFI restart. No erase/install or arbitrary shell commands.
Python 3.8+, standard library only. Credentials remain in process memory.
"""
import argparse
import ctypes
import datetime
import getpass
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ENDPOINT = 'https://giunepklvuwgboaektzd.supabase.co/functions/v1/recovery-control'
VERSION = '1.0.0'
MAX_IMAGE_BYTES = 1073741824


def text(path):
    try:
        return Path(path).read_text(errors='replace').strip()
    except OSError:
        return ''


def run(args):
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=20).strip()
    except (OSError, subprocess.SubprocessError):
        return ''


def is_admin():
    if platform.system() == 'Windows':
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    return os.geteuid() == 0


def can_sudo():
    return bool(shutil.which('sudo')) and run(['sudo', '-n', 'id', '-u']) == '0'


def hardware_report():
    system = platform.system()
    report = dict(manufacturer='', model='', architecture=platform.machine(), os=system,
                  os_version=platform.release(), firmware_type='Unknown', firmware_version='',
                  cpu=platform.processor(), memory_gb=None, environment='installed',
                  firmware_restart=False, agent_version=VERSION, disks=[])
    if system == 'Windows':
        ps = r'''$c=Get-CimInstance Win32_ComputerSystem; $b=Get-CimInstance Win32_BIOS; $o=Get-CimInstance Win32_OperatingSystem; $p=Get-CimInstance Win32_Processor | Select-Object -First 1; @{manufacturer=$c.Manufacturer; model=$c.Model; firmware_version=$b.SMBIOSBIOSVersion; os=$o.Caption; os_version=$o.Version; cpu=$p.Name; memory_gb=[math]::Round($c.TotalPhysicalMemory/1GB,1); disks=@(Get-CimInstance Win32_DiskDrive | ForEach-Object { @{name=$_.DeviceID; size=[string]$_.Size; transport=$_.InterfaceType; model=$_.Model} })} | ConvertTo-Json -Depth 4 -Compress'''
        output = run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', ps])
        if output:
            report.update(json.loads(output))
        firmware = ctypes.c_ulong()
        if ctypes.windll.kernel32.GetFirmwareType(ctypes.byref(firmware)):
            report['firmware_type'] = {1: 'Legacy BIOS', 2: 'UEFI'}.get(firmware.value, 'Unknown')
        report['firmware_restart'] = report['firmware_type'] == 'UEFI' and is_admin()
        # Native architecture remains correct when 32-bit Python is used on x64 Windows.
        report['architecture'] = os.environ.get('PROCESSOR_ARCHITEW6432', os.environ.get('PROCESSOR_ARCHITECTURE', report['architecture']))
    elif system == 'Darwin':
        report.update(manufacturer='Apple', model=run(['sysctl', '-n', 'hw.model']),
                      os='macOS', os_version=run(['sw_vers', '-productVersion']),
                      cpu=run(['sysctl', '-n', 'machdep.cpu.brand_string']), firmware_type='Apple firmware')
        if run(['sysctl', '-n', 'hw.optional.arm64']) == '1':
            report['architecture'] = 'arm64'
        memory = run(['sysctl', '-n', 'hw.memsize'])
        if memory.isdigit():
            report['memory_gb'] = round(int(memory) / 2**30, 1)
    elif system == 'Linux':
        report.update(manufacturer=text('/sys/class/dmi/id/sys_vendor'),
                      model=text('/sys/class/dmi/id/product_name'),
                      firmware_version=text('/sys/class/dmi/id/bios_version'),
                      firmware_type='UEFI' if Path('/sys/firmware/efi').is_dir() else 'Legacy BIOS / unavailable')
        release = text('/etc/os-release')
        for line in release.splitlines():
            if line.startswith('PRETTY_NAME='):
                report['os'] = line.partition('=')[2].strip('"')
        for line in text('/proc/cpuinfo').splitlines():
            if line.startswith('model name'):
                report['cpu'] = line.partition(':')[2].strip(); break
        for line in text('/proc/meminfo').splitlines():
            if line.startswith('MemTotal:'):
                report['memory_gb'] = round(int(line.split()[1]) / 2**20, 1)
        cmdline = text('/proc/cmdline')
        if 'boot=live' in cmdline:
            report['environment'] = 'live USB'
        if Path('/.dockerenv').exists() or 'container=' in cmdline:
            report['environment'] = 'container'
        if 'microsoft' in text('/proc/version').lower():
            report['environment'] = 'WSL'
        if 'CHROMEOS_RELEASE_NAME=' in text('/etc/lsb-release'):
            report['os'] = 'ChromeOS'
        disks = run(['lsblk', '-J', '-d', '-b', '-o', 'NAME,SIZE,TRAN,MODEL'])
        if disks:
            report['disks'] = [dict(name=d.get('name') or '', size=str(d.get('size') or ''),
                                    transport=d.get('tran') or '', model=d.get('model') or '')
                               for d in json.loads(disks).get('blockdevices', []) if not (d.get('name') or '').startswith(('loop', 'ram'))][:16]
        indication = Path('/sys/firmware/efi/efivars/OsIndicationsSupported-8be4df61-93ca-11d2-aa0d-00e098032b8c')
        try:
            supported = bool(int.from_bytes(indication.read_bytes()[4:], 'little') & 1)
        except OSError:
            supported = False
        report['firmware_restart'] = (supported and (is_admin() or can_sudo())
                                      and report['environment'] not in ('container', 'WSL')
                                      and report['os'] != 'ChromeOS')
    return report


class DeviceClient:
    def __init__(self):
        self.token = None

    def call(self, op, **body):
        raw = json.dumps(dict(op=op, **body)).encode()
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        req = urllib.request.Request(ENDPOINT, data=raw, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Never echo request headers or credentials.
            if error.code == 401:
                raise PermissionError('Pairing or session expired/disconnected. Pair again.') from None
            try:
                message = json.loads(error.read(4096)).get('error', 'Request failed')
            except (ValueError, OSError):
                message = 'Request failed'
            raise RuntimeError(str(message)) from None


def expired(command):
    return datetime.datetime.fromisoformat(command['expires_at'].replace('Z', '+00:00')).timestamp() <= time.time()


def confirm(prompt, word):
    return sys.stdin.isatty() and input(prompt + '\nType ' + word + ' to approve: ').strip() == word


def validate_image(payload):
    url, digest = payload.get('url', ''), payload.get('sha256', '')
    if not re.fullmatch(r'https://github\.com/tyron40/Ty-Recovery-USB/releases/download/bootable-[0-9]+/Ty-Recovery-USB-amd64\.iso', url):
        raise ValueError('The image URL is not an approved recovery release')
    if not re.fullmatch(r'[a-fA-F0-9]{64}', digest):
        raise ValueError('Missing SHA-256 image digest')
    return url, digest.lower()


def download_toolkit(client, command, directory):
    url, digest = validate_image(command['payload'])
    if not confirm('Download the bootable PC toolkit (up to 1 GiB)? This does not install or boot it.', 'DOWNLOAD'):
        return 'declined', 'Download declined locally.'
    if expired(command):
        return 'declined', 'Request expired before local approval.'
    directory = Path(directory).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(directory).free < MAX_IMAGE_BYTES + 64 * 1024**2:
        raise RuntimeError('Not enough free space for a safe download')
    destination = directory / ('Ty-Recovery-' + digest[:12] + '.iso')
    fd, temp_name = tempfile.mkstemp(prefix='.elite-download-', suffix='.part', dir=directory)
    try:
        sha = hashlib.sha256(); size = 0; last_progress = 0
        with os.fdopen(fd, 'wb') as output, urllib.request.urlopen(url, timeout=30) as response:
            from urllib.parse import urlsplit
            final = urlsplit(response.geturl())
            if final.scheme != 'https' or final.hostname not in {'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}:
                raise ValueError('Unexpected image download destination')
            total = int(response.headers.get('Content-Length', 0))
            if total > MAX_IMAGE_BYTES:
                raise ValueError('Image exceeds the download size limit')
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk: break
                size += len(chunk)
                if size > MAX_IMAGE_BYTES or expired(command):
                    raise RuntimeError('Download exceeded its size or time limit')
                output.write(chunk); sha.update(chunk)
                if time.monotonic() - last_progress > 5:
                    client.call('device_progress', command_id=command['id'], percent=round(size / total * 99, 1) if total else 0,
                                message='Downloading; checksum not yet verified')
                    last_progress = time.monotonic()
        if sha.hexdigest() != digest:
            raise ValueError('SHA-256 mismatch. Download discarded; do not use it.')
        # Revalidate the session before retaining a completed download.
        client.call('device_progress', command_id=command['id'], percent=100, message='SHA-256 verified')
        os.replace(temp_name, destination)
        print('Verified file saved:', destination)
        return 'completed', 'Downloaded toolkit; SHA-256 verified. File: ' + destination.name + '. Boot media preparation remains a separate step.'
    finally:
        if Path(temp_name).exists(): Path(temp_name).unlink()


def firmware_restart(command, client=None):
    report = hardware_report()
    if not report['firmware_restart']:
        return 'failed', 'A firmware restart is not supported or this companion lacks permission.'
    if not confirm('Restart THIS computer into UEFI settings? Save open work first.\nDevice: ' + report['manufacturer'] + ' ' + report['model'], 'RESTART'):
        return 'declined', 'Firmware restart declined locally.'
    if expired(command):
        return 'declined', 'Request expired before local approval.'
    if client:
        client.call('device_progress', command_id=command['id'], percent=0, message='Local firmware restart approved')
    if platform.system() == 'Windows':
        args = ['shutdown.exe', '/r', '/fw', '/t', '0']
    else:
        args = ([] if is_admin() else ['sudo', '-n']) + ['systemctl', 'reboot', '--firmware-setup']
    subprocess.run(args, check=True, timeout=30)
    return 'completed', 'Firmware restart command submitted. Arrival in firmware settings has not been verified.'


def main(code_provider=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report-only', action='store_true', help='Print local JSON; upload nothing')
    parser.add_argument('--download-directory', default=str(Path.home() / 'Downloads' / 'Elite-Recovery'))
    args = parser.parse_args()
    report = hardware_report()
    print(json.dumps(report, indent=2))
    if args.report_only: return
    print('\nPair with Elite Recovery using a code from your signed-in dashboard.\nThe report above is shared only after you approve. No serial numbers or personal files are collected.\nDevice credentials remain in memory; closing this program disconnects it.')
    code = (code_provider() if code_provider else getpass.getpass('Paste the pairing code (hidden): ')).strip()
    if not re.fullmatch(r'[a-f0-9]{48}', code):
        raise ValueError('Pairing code must contain 48 lowercase hex characters')
    if not confirm('Share this hardware report with the Elite account that generated the code?', 'PAIR'):
        return
    client = DeviceClient()
    paired = client.call('device_claim', code=code, report=report)
    client.token = paired['token']
    print('Paired. Keep this window open. Downloads and firmware restarts require your approval here. Ctrl+C disconnects.')
    last_scan = 0
    while True:
        try:
            payload = {}
            if time.monotonic() - last_scan > 60:
                payload['report'] = hardware_report(); last_scan = time.monotonic()
            command = client.call('device_poll', **payload).get('command')
            if command:
                try:
                    if expired(command):
                        status, result = 'declined', 'Request already expired.'
                    elif command['kind'] == 'scan':
                        client.call('device_poll', report=hardware_report())
                        status, result = 'completed', 'Hardware report refreshed. No disk content was inspected.'
                    elif command['kind'] == 'download_toolkit':
                        status, result = download_toolkit(client, command, args.download_directory)
                    elif command['kind'] == 'reboot_firmware':
                        status, result = firmware_restart(command, client)
                    else:
                        status, result = 'failed', 'Unsupported request; nothing executed.'
                except PermissionError:
                    raise
                except Exception as error:
                    status, result = 'failed', str(error)[:500]
                client.call('device_result', command_id=command['id'], status=status, result=result)
                print(result)
        except PermissionError:
            raise
        except (RuntimeError, urllib.error.URLError, TimeoutError):
            print('Connection interrupted; retrying. The dashboard may show this device offline.')
        time.sleep(5)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nCompanion stopped. The dashboard will mark this device offline.')
    except Exception as error:
        print('Companion stopped:', str(error), file=sys.stderr)
        sys.exit(1)
