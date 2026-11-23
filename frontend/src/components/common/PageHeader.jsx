// PURPOSE: Consistent page title, subtitle, and action row.
import { Box, Stack, Typography } from '@mui/material';
import { pageHeaderRow, pageTitleSx } from '../../utils/responsive';

export default function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  hidden = false,
}) {
  if (hidden) {
    return actions ? (
      <Box sx={{ ...pageHeaderRow, mb: 2 }}>{actions}</Box>
    ) : null;
  }

  return (
    <Box sx={pageHeaderRow}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <Typography variant="overline" color="primary" sx={{ display: 'block', lineHeight: 1.2 }}>
            {eyebrow}
          </Typography>
        )}
        {title && (
          <Typography variant="h5" sx={pageTitleSx}>
            {title}
          </Typography>
        )}
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          sx={{ width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}
        >
          {actions}
        </Stack>
      )}
    </Box>
  );
}
