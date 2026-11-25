# Release gate for a non-deterministic feature: run each case several times,
# then gate on a conservative lower bound of the pass rate, not one lucky run.
import math

def wilson_lower(passes, runs, z=1.96):
    """95% Wilson score lower bound for a pass rate."""
    if runs == 0:
        return 0.0
    p = passes / runs
    centre = p + z * z / (2 * runs)
    spread = z * math.sqrt(p * (1 - p) / runs + z * z / (4 * runs * runs))
    return (centre - spread) / (1 + z * z / runs)

results = {  # case id -> passes out of 10 runs
    'refund-policy': 10,
    'cancel-order': 9,
    'unanswerable-question': 6,
}
RUNS = 10
GATE = 0.70

for case, passes in results.items():
    low = wilson_lower(passes, RUNS)
    verdict = 'OK' if low >= GATE else 'BLOCK'
    print(f'{case}: {passes}/{RUNS} passed, lower bound {low:.2f} -> {verdict}')
