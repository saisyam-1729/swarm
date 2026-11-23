// PURPOSE: Loading placeholders for stats, cards, and tables.
import { Box, Card, CardContent, Grid, Skeleton, Stack } from '@mui/material';

function StatSkeleton() {
  return (
    <Card>
      <CardContent>
        <Skeleton width={96} height={16} />
        <Skeleton width={64} height={36} sx={{ mt: 1 }} />
        <Skeleton width={120} height={14} />
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Skeleton variant="rounded" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={28} />
            <Skeleton width="50%" height={14} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function LoadingSkeleton({ variant = 'cards', count = 8, stats = 4 }) {
  if (variant === 'page' || variant === 'spinner') {
    return (
      <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
        <Skeleton variant="circular" width={40} height={40} />
      </Box>
    );
  }

  if (variant === 'stats') {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: stats }).map((_, i) => (
          <Grid item xs={6} md={3} key={i}>
            <StatSkeleton />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (variant === 'table') {
    return (
      <Card>
        <CardContent>
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} height={36} sx={{ mb: 1 }} />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Grid container spacing={2}>
      {Array.from({ length: count }).map((_, i) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
          <CardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
}
