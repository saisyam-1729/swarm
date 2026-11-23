// PURPOSE: Reusable metric tile for dashboards of any collection size.
import { Box, Card, CardActionArea, CardContent, Skeleton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export default function DashboardStatCard({
  label,
  value,
  hint,
  icon,
  color = 'primary',
  onClick,
  loading = false,
  suffix,
}) {
  const content = (
    <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minHeight: 108 }}>
      {icon && (
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            bgcolor: (t) => alpha(t.palette[color]?.main || t.palette.primary.main, 0.12),
            color: `${color}.main`,
          }}
        >
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ letterSpacing: '0.04em' }}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton width={72} height={36} />
        ) : (
          <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2, mt: 0.25 }} noWrap>
            {value ?? '—'}
            {suffix && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                {suffix}
              </Typography>
            )}
          </Typography>
        )}
        {hint && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }} noWrap>
            {hint}
          </Typography>
        )}
      </Box>
    </CardContent>
  );

  if (onClick) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardActionArea onClick={onClick} sx={{ height: '100%', alignItems: 'stretch' }}>
          {content}
        </CardActionArea>
      </Card>
    );
  }

  return <Card sx={{ height: '100%' }}>{content}</Card>;
}
