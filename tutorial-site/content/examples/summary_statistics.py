from statistics import mean, median

seconds = [1, 1, 2, 20]
print(f'mean={mean(seconds):.1f}, median={median(seconds):.1f}')
true_positives, false_positives = 9, 99
precision = true_positives / (true_positives + false_positives)
print(f'precision={precision:.1%}')
