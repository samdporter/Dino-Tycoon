"""Stdlib HTTP integration checks: python3 -m unittest discover -s tests -p 'test_server.py'."""
import importlib.util
from pathlib import Path
import re
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('game_server', ROOT / 'server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PublicServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = module.ThreadingHTTPServer(('127.0.0.1', 0), module.PublicHandler)
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_entrypoint_and_script(self):
        for path in ['/', '/index.html', '/zoo.html', '/src/shared/15-storage.js', '/styles/tycoon.css']:
            with self.subTest(path=path), urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200)
                self.assertIn('no-cache', response.headers['Cache-Control'])
                response.read()

    def test_both_games_load_all_declared_assets(self):
        for entry in ['/index.html', '/zoo.html']:
            with urlopen(self.base + entry) as response:
                html = response.read().decode('utf-8')
            for asset in re.findall(r'(?:src|href)="((?:src|styles|vendor)/[^" ]+)"', html):
                with self.subTest(entry=entry, asset=asset), urlopen(self.base + '/' + asset) as response:
                    self.assertEqual(response.status, 200)
                    self.assertTrue(response.read())

    def test_both_games_use_shared_engine_and_coaster_scripts(self):
        shared = {
            '10-core.js', '15-storage.js', '21-sim-coaster.js', '30-models-toilets.js',
            '48-world-coaster.js', '58-streetview.js', '59-weather-hud.js',
            '66b-ui-coaster.js',
        }
        for entry in ['/index.html', '/zoo.html']:
            with self.subTest(entry=entry), urlopen(self.base + entry) as response:
                html = response.read().decode('utf-8')
                scripts = re.findall(r'<script defer src="src/shared/([^" ]+)"', html)
                self.assertTrue(shared.issubset(scripts), shared.difference(scripts))

    def test_private_files_and_traversal_are_not_served(self):
        for path in ['/.git/config', '/README.md', '/server.py', '/tests/test_browser.py', '/%2e%2e/README.md', '/src/%2e%2e/README.md', '/src/']:
            with self.subTest(path=path):
                with self.assertRaises(HTTPError) as error:
                    urlopen(self.base + path)
                self.assertEqual(error.exception.code, 404)

if __name__ == '__main__':
    unittest.main()
