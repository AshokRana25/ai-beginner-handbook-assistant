const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP"];

function validateInvoice(data, orderTotal) {
  if (typeof data !== "object" || data === null) return ["output must be a JSON object"];
  const errors = [];
  if (typeof data.vendor !== "string" || !data.vendor.trim()) errors.push("vendor is required");
  if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount < 0) {
    errors.push("amount must be a non-negative number");
  } else if (data.amount > orderTotal) {
    errors.push("amount exceeds the order total");
  }
  if (!SUPPORTED_CURRENCIES.includes(data.currency)) errors.push("unsupported currency");
  return errors;
}

const modelOutput = '{"vendor": "Acme", "amount": 900, "currency": "USD"}';
let parsed = null;
try {
  parsed = JSON.parse(modelOutput);
} catch {
  // Leave parsed as null so validation reports the problem.
}
console.log(validateInvoice(parsed, 90));
