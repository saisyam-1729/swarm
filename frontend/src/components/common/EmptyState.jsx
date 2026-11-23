// PURPOSE: Shared empty-state layout for list, grid, and chart pages.
import { Box, Button, Typography } from '@mui/material';
import { InboxOutlined } from '@mui/icons-material';

export default function EmptyState({
  title = 'Nothing to show yet',
  description,
  icon,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <Box sx={{ py: compact ? 4 : 6, px: 2, textAlign: 'center' }}>
      <Box sx={{ color: 'text.disabled', mb: 1.5, display: 'flex', justifyContent: 'center' }}>
        {icon || <InboxOutlined sx={{ fontSize: compact ? 36 : 44 }} />}
      </Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction} sx={{ mt: 2 }}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
