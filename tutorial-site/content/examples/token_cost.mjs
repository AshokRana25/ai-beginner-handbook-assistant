// Fictional rates in currency units per million tokens, NOT vendor prices.
const rates = { input: 2, output: 8 };
function estimate(inputTokens, outputTokens) {
  if (![inputTokens, outputTokens].every(n => Number.isInteger(n) && n >= 0)) {
    throw new Error('Token counts must be nonnegative integers');
  }
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
const single = estimate(1000, 250);
console.log(`single=${single.toFixed(6)}`);
console.log(`three-attempts=${(single * 3).toFixed(6)}`);
