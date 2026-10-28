def recall_at_k(relevant, ranked, k):
    relevant = set(relevant)
    if not relevant:
        return None  # Score unanswerable cases separately.
    if k < 1:
        raise ValueError('k must be positive')
    return len(relevant.intersection(ranked[:k])) / len(relevant)


value = recall_at_k(['p1', 'p2', 'p3'], ['p2', 'p8', 'p1', 'p3'], 3)
print(f'recall@3={value:.3f}')
