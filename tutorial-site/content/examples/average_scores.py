records = [{"score": 2}, {"score": None}, {"score": 4}]
scores = [r["score"] for r in records if r["score"] is not None]
average = sum(scores) / len(scores) if scores else None
print(average)  # 3.0
