def dot(features, weights):
    if len(features) != len(weights):
        raise ValueError('Features and weights must have the same dimension')
    return sum(x * w for x, w in zip(features, weights))


print(f'score={dot([2, 3], [4, 5])}')
