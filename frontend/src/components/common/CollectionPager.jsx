// PURPOSE: Pagination control for large API collections.
import { Box, Pagination, Typography } from '@mui/material';

export default function CollectionPager({ page, pageCount, total, filteredCount, onPage, pageSize }) {
  if (!total && !filteredCount) return null;
  const showingFrom = filteredCount === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min((page + 1) * pageSize, filteredCount);
  if (pageCount <= 1 && filteredCount <= pageSize) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {filteredCount} {filteredCount === 1 ? 'item' : 'items'}
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 2 }}>
      <Typography variant="caption" color="text.secondary">
        {showingFrom}–{showingTo} of {filteredCount}
        {total !== filteredCount ? ` (filtered from ${total})` : ''}
      </Typography>
      {pageCount > 1 && (
        <Pagination
          count={pageCount}
          page={page + 1}
          onChange={(_, p) => onPage(p - 1)}
          size="small"
          color="primary"
          showFirstButton
          showLastButton
        />
      )}
    </Box>
  );
}
