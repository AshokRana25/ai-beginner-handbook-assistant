# Agent trajectory test: check WHICH tools were called, in what order, with
# what arguments, not just the final answer.

trace = [
    {'tool': 'lookup_order', 'args': {'order_id': 'A-1001'}},
    {'tool': 'check_refund_policy', 'args': {'days_since_delivery': 12}},
    {'tool': 'issue_refund', 'args': {'order_id': 'A-1001', 'amount': 40.0}},
]

expectations = {
    'required_in_order': ['lookup_order', 'check_refund_policy', 'issue_refund'],
    'forbidden': ['delete_account', 'send_email_to_all'],
    'max_steps': 5,
    'refund_limit': 50.0,
}

def is_subsequence(needed, actual):
    it = iter(actual)
    return all(step in it for step in needed)

tools = [step['tool'] for step in trace]
checks = {
    'required tools in order': is_subsequence(expectations['required_in_order'], tools),
    'no forbidden tools': not set(tools) & set(expectations['forbidden']),
    'within step budget': len(trace) <= expectations['max_steps'],
    'refund within limit': all(s['args'].get('amount', 0) <= expectations['refund_limit'] for s in trace if s['tool'] == 'issue_refund'),
    'refund matches looked-up order': trace[2]['args']['order_id'] == trace[0]['args']['order_id'],
}
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
