def precision_recall(tp, fp, fn):
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    return precision, recall


# 20 flagged payments, 15 correct; 30 problematic payments in total.
precision, recall = precision_recall(tp=15, fp=5, fn=15)
print(f"precision={precision:.2f} recall={recall:.2f}")
