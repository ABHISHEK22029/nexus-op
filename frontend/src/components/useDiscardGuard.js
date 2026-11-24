/* ══════════════════════════════════════════════════════════
   useDiscardGuard — a popup with a form doesn't throw away what was typed.

   Reported: "if you enter some info it gets erased". Three ways a popup
   used to close and take the typing with it:
     · a click that ENDED on the dimmed area — select the amount by dragging
       left past the box's edge, let go, and the box was gone
     · Esc, pressed to dismiss the browser's autofill list
     · a stray click outside the box
   Now a click closes only if it both starts and ends on the dimmed area,
   and once anything has been typed, Esc or that click asks first.

     const guard = useDiscardGuard(onClose);
     <div {...guard.backdropProps}>          the dimmed area
       <div {...guard.panelProps}>…</div>    the box: typing in it counts
     Esc → guard.tryClose()

   Cancel, ✕ and a successful save still close at once: those are choices.
   ══════════════════════════════════════════════════════════ */
import { useCallback, useRef } from 'react';
import { useConfirm } from '../context/ConfirmContext';

export function useDiscardGuard(onClose, { message, disabled } = {}) {
  const { confirm } = useConfirm();
  const typed = useRef(false);
  const startedOnBackdrop = useRef(false);
  const asking = useRef(false);
  const latest = useRef({ onClose, message, disabled });
  latest.current = { onClose, message, disabled };

  const tryClose = useCallback(async () => {
    const { onClose: close, message: msg, disabled: off } = latest.current;
    if (off || asking.current) return;
    if (typed.current) {
      asking.current = true;
      const discard = await confirm({
        title: 'Discard what you typed?',
        message: msg || "It isn't saved yet.",
        confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'danger',
      });
      asking.current = false;
      if (!discard) return;
    }
    close?.();
  }, [confirm]);

  /* The same function every render: React calls a new ref callback with
     null and then the element, which would forget the typing each time. */
  const panelRef = useCallback((el) => { if (!el) typed.current = false; }, []);
  const onInput = useCallback(() => { typed.current = true; }, []);

  return {
    tryClose,
    backdropProps: {
      onMouseDown: (e) => { startedOnBackdrop.current = e.target === e.currentTarget; },
      onClick: (e) => {
        const both = startedOnBackdrop.current && e.target === e.currentTarget;
        startedOnBackdrop.current = false;
        if (both) tryClose();
      },
    },
    // A fresh box starts clean: the guard outlives one opening of it.
    panelProps: { onInput, ref: panelRef },
  };
}
