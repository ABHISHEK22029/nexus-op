/* How money moved: one list on every screen that records a payment.
   Each had its own — the invoice had no NEFT and no card, Payables had
   "Bank" and "NEFT" as two choices, Expenses had card but the others did
   not — so a question as plain as "how were we paid this month" split one
   method three ways. NEFT, RTGS and IMPS are all a bank transfer; the
   reference (UTR) says which. Records made before this keep what they say. */
export const PAYMENT_MODES = ['Bank transfer', 'UPI', 'Cash', 'Cheque', 'Card'];
export const DEFAULT_PAYMENT_MODE = 'Bank transfer';
