/* 067 — reminders can be switched off.

   The Automation page showed overdue-invoice reminders as permanently ON,
   with no way to stop them. A company that chases payment by phone, or is
   testing with made-up invoices, should be able to turn them off. On by
   default, so nobody who relied on them loses them. */
ALTER TABLE automation_settings
  ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;
