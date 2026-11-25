// PURPOSE: In-app replacements for window.alert / window.confirm (snackbar toasts + confirm dialog).
import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Snackbar,
} from '@mui/material';
import { WarningAmberRounded, HelpOutlineRounded } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';

const FeedbackContext = createContext(null);

const DEFAULT_CONFIRM = {
  title: 'Are you sure?',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  danger: false,
};

export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  /** Show a non-blocking message. severity: success | info | warning | error */
  const notify = useCallback((message, severity = 'info') => {
    if (!message) return;
    setToast({ message: String(message), severity, key: Date.now() });
    setToastOpen(true);
  }, []);

  /**
   * Ask the user to confirm. Resolves true on confirm, false on cancel/close.
   * Accepts a message string or { title, message, confirmText, cancelText, danger }.
   */
  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    // Settle any dialog still open so its caller never hangs.
    resolverRef.current?.(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({ ...DEFAULT_CONFIRM, ...opts });
    });
  }, []);

  const settle = (result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  };

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);
  const danger = !!dialog?.danger;

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <Dialog
        open={!!dialog}
        onClose={() => settle(false)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="confirm-dialog-title"
      >
        <DialogTitle id="confirm-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
          <Box
            sx={(t) => {
              const c = danger ? t.palette.error.main : t.palette.primary.main;
              return {
                width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', flexShrink: 0,
                color: c, bgcolor: alpha(c, 0.1),
              };
            }}
          >
            {danger ? <WarningAmberRounded fontSize="small" /> : <HelpOutlineRounded fontSize="small" />}
          </Box>
          {dialog?.title}
        </DialogTitle>
        {dialog?.message && (
          <DialogContent>
            <DialogContentText sx={{ color: 'text.secondary' }}>{dialog.message}</DialogContentText>
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => settle(false)} color="inherit">{dialog?.cancelText}</Button>
          <Button
            onClick={() => settle(true)}
            variant="contained"
            color={danger ? 'error' : 'primary'}
            autoFocus
          >
            {dialog?.confirmText}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        key={toast?.key}
        open={toastOpen}
        autoHideDuration={toast?.severity === 'error' ? 7000 : 4000}
        onClose={(_, reason) => { if (reason !== 'clickaway') setToastOpen(false); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: { xs: 'env(safe-area-inset-bottom, 0px)' } }}
      >
        <Alert
          onClose={() => setToastOpen(false)}
          severity={toast?.severity || 'info'}
          variant="filled"
          sx={{ width: '100%', maxWidth: 520, boxShadow: '0 8px 24px rgba(16,24,40,0.18)' }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}
