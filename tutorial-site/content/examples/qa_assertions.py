# Layered oracles: cheap deterministic checks first, judgement later.
import json
import re

raw_output = '{"category": "billing", "priority": "high", "reply": "Sorry about the double charge. I have opened refund case 4821."}'

def check(name, ok, results):
    results.append((name, ok))

results = []
try:
    data = json.loads(raw_output)
    check('valid JSON', True, results)
except json.JSONDecodeError:
    data = {}
    check('valid JSON', False, results)

check('required keys', {'category', 'priority', 'reply'} <= data.keys(), results)
check('allowed category', data.get('category') in {'billing', 'technical', 'unclear'}, results)
check('allowed priority', data.get('priority') in {'low', 'medium', 'high'}, results)
reply = data.get('reply', '')
check('reply length 10-300', 10 <= len(reply) <= 300, results)
check('no email address leaked', re.search(r'[\w.]+@[\w.]+', reply) is None, results)
check('no promise of a refund amount', re.search(r'[$€£]\s?\d', reply) is None, results)

for name, ok in results:
    print(('PASS' if ok else 'FAIL'), name)
print(f'{sum(ok for _, ok in results)}/{len(results)} checks passed')
