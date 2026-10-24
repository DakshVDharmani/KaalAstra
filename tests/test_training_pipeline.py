import hashlib
import json
import pathlib
import re
import sys
import tempfile
import unittest
import zipfile
from types import SimpleNamespace
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from risk_core import SCHEMA, make_prompt, metrics, choose_threshold, balance, encode_rows, cluster_intervals
from audit_training_data import audit
from evaluate_kaggle import cached_predictions
from export_run import export_run

class CoreTests(unittest.TestCase):
    def test_missed_vulnerabilities_not_rewarded(self):
        result = metrics([1] * 30 + [0] * 30, [.1] * 60)
        self.assertEqual((result['fn'], result['recall'], result['f1']), (30, 0, 0))
        self.assertEqual(result['balanced_accuracy'], .5)
        for bad in (float('nan'), float('inf'), -1):
            with self.assertRaises(ValueError): metrics([1], [bad])

    def test_threshold_and_paired_intervals(self):
        selected = choose_threshold([0, 0, 1, 1], [.1, .4, .6, .9])
        self.assertEqual(selected['f1'], 1)
        self.assertLessEqual(selected['false_positive_rate'], .2)
        rows = [{'actual': y, 'project': str(i), 'base': .1, 'adapter': s}
                for i, (y, s) in enumerate(zip([0, 0, 1, 1], [.1, .1, .9, .9]))]
        result = cluster_intervals(rows, {'base': .5, 'adapter': .5}, repeats=50)
        self.assertGreater(result['f1']['low'], 0)
        with self.assertRaises(ValueError): choose_threshold([0], [.1])

    def test_no_label_preserving_truncation(self):
        class Tokenizer:
            def apply_chat_template(self, prompt, **kwargs): return prompt
            def encode(self, text, **kwargs): return list(range(len(text)))
        rows = [{'prompt': 'a', 'metadata': {'label': 0}}, {'prompt': 'a' * 100, 'metadata': {'label': 1}}]
        kept, excluded = encode_rows(rows, Tokenizer(), 20)
        self.assertEqual(len(kept), 1)
        self.assertEqual(excluded, {'1': 1})

    def test_hard_negatives_survive_balance(self):
        rows = [{'labels': y, 'metadata': {'source': source}} for y, source in
                [(0, 'other')] * 10 + [(0, 'PrimeVul_fixed')] * 2 + [(1, 'vuln')] * 2]
        kept = balance(rows, 42)
        self.assertEqual(len(kept), 4)
        self.assertTrue(all(r['metadata']['source'] == 'PrimeVul_fixed' for r in kept if r['labels'] == 0))

    def test_cache_recovers_partial_and_refuses_other_model(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'predictions.jsonl'
            row = {'id': 'a', 'cache_identity': 'current', 'score': .2}
            path.write_text(json.dumps(row) + '\n{"incomplete":')
            self.assertEqual(cached_predictions(path, 'current'), {'a': row})
            self.assertEqual(len(path.read_text().splitlines()), 1)
            with self.assertRaises(ValueError): cached_predictions(path, 'other')

    def test_exports_diagnostics_without_checkpoints(self):
        with tempfile.TemporaryDirectory() as directory:
            run = pathlib.Path(directory) / 'run'
            (run / 'checkpoints').mkdir(parents=True)
            (run / 'checkpoints' / 'large.bin').write_bytes(b'x')
            (run / 'pipeline_status.json').write_text('{"status":"incomplete"}')
            (run / 'predictions.jsonl').write_text('saved\n')
            with zipfile.ZipFile(export_run(run)) as archive:
                self.assertEqual(set(archive.namelist()), {'pipeline_status.json', 'predictions.jsonl'})

    def test_data_audit_detects_leakage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for split in ('train', 'validation', 'test'):
                rows = []
                for label in (0, 1):
                    code = f'int {split}_{label}() {{ return {label}; }}'
                    meta = {'label': label, 'language': 'c', 'source': 'fixture', 'project': split,
                            'code_sha256': hashlib.sha256(re.sub(r'\s+', ' ', code).strip().encode()).hexdigest()}
                    rows.append({'schema': SCHEMA, 'code': code, 'prompt': make_prompt(code, 'c'),
                        'completion': [{'role': 'assistant', 'content': 'A' if label else 'B'}], 'metadata': meta})
                (root / (split + '.jsonl')).write_text(''.join(json.dumps(r) + '\n' for r in rows))
            self.assertTrue(audit(root)['passed'])
            path = root / 'test.jsonl'
            text = path.read_text().replace('"project": "test"', '"project": "train"')
            path.write_text(text)
            with self.assertRaisesRegex(ValueError, 'project leakage'): audit(root)

if __name__ == '__main__': unittest.main()
