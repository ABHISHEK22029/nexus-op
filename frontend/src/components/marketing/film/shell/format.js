/* Money the way Indian documents print it: ₹3,28,500. */
export const rupee = (n, d = 0) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
