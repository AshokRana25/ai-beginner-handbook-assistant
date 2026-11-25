# Metamorphic testing: when you cannot know the exact right output, check
# relations that must hold between related inputs.

def classify(message):
    """Stand-in for an AI ticket classifier (deterministic for the demo)."""
    text = message.lower()
    if 'refund' in text or 'charged' in text or 'invoice' in text:
        return 'billing'
    if 'crash' in text or 'error' in text or 'login' in text:
        return 'technical'
    return 'unclear'


def transforms(message):
    """Changes that should NOT change the label."""
    yield 'uppercase', message.upper()
    yield 'polite prefix', 'Hi team, ' + message
    yield 'trailing spaces', message + '   '
    yield 'synonym', message.replace('charged', 'billed')


seeds = [
    'Hello, I was charged twice this month.',
    'Hello, the app shows an error on login.',
    'Hello, can someone call me back?',
]

failures = 0
for seed in seeds:
    expected = classify(seed)
    for name, variant in transforms(seed):
        if classify(variant) != expected:
            failures += 1
            print(f'FAIL {name}: {variant!r}')

checks = len(seeds) * 4
print(f'{checks - failures}/{checks} metamorphic checks passed')
