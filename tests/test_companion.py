import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('companion', Path(__file__).resolve().parents[1] / 'public/recovery/companion.py')
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)
URL = 'https://github.com/tyron40/Ty-Recovery-USB/releases/download/bootable-4/Ty-Recovery-USB-amd64.iso'

class Reply(io.BytesIO):
    headers = {'Content-Length': '9'}
    def geturl(self): return URL

class Client:
    def __init__(self): self.calls = []
    def call(self, op, **body): self.calls.append((op, body)); return {}

class Tests(unittest.TestCase):
    def command(self, digest):
        return {'id': 'test', 'expires_at': '2099-01-01T00:00:00Z', 'payload': {'url': URL, 'sha256': digest}}

    def test_arbitrary_image_sources_rejected(self):
        with self.assertRaises(ValueError): c.validate_image({'url': 'https://evil.example/disk.iso', 'sha256': '0'*64})
        with self.assertRaises(ValueError): c.validate_image({'url': URL, 'sha256': 'bad'})

    def test_checksum_failure_discards_download(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(c, 'confirm', return_value=True), patch.object(c.urllib.request, 'urlopen', return_value=Reply(b'testbytes')):
            with self.assertRaises(ValueError): c.download_toolkit(Client(), self.command('0'*64), directory)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_verified_download_is_retained_without_execution(self):
        digest = hashlib.sha256(b'testbytes').hexdigest(); client = Client()
        with tempfile.TemporaryDirectory() as directory, patch.object(c, 'confirm', return_value=True), patch.object(c.urllib.request, 'urlopen', return_value=Reply(b'testbytes')), patch.object(c.subprocess, 'run') as execute:
            status, message = c.download_toolkit(client, self.command(digest), directory)
            self.assertEqual(status, 'completed'); self.assertIn('verified', message)
            self.assertEqual(next(Path(directory).iterdir()).read_bytes(), b'testbytes')
            execute.assert_not_called()

    def test_reboot_requires_capability(self):
        with patch.object(c, 'hardware_report', return_value={'firmware_restart': False}), patch.object(c.subprocess, 'run') as execute:
            self.assertEqual(c.firmware_restart({})[0], 'failed'); execute.assert_not_called()

    def test_reboot_decline_never_executes(self):
        with patch.object(c, 'hardware_report', return_value={'firmware_restart': True, 'manufacturer': 'Test', 'model': 'Device'}), patch.object(c, 'confirm', return_value=False), patch.object(c.subprocess, 'run') as execute:
            self.assertEqual(c.firmware_restart({})[0], 'declined'); execute.assert_not_called()

    def test_noninteractive_confirmation_denied(self):
        with patch.object(c.sys.stdin, 'isatty', return_value=False):
            self.assertFalse(c.confirm('Restart?', 'RESTART'))

if __name__ == '__main__': unittest.main()
