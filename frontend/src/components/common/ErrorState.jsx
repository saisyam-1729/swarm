// PURPOSE: Shared error state with optional retry for API-backed pages.
import { Alert, Box, Button } from '@mui/material';

export default function ErrorState({
  title = 'Unable to load data',
  description,
  onRetry,
  severity = 'error',
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Alert
        severity={severity}
        action={onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>Retry</Button>
        ) : null}
      >
        {description || title}
      </Alert>
    </Box>
  );
}
