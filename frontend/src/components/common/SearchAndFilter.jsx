// PURPOSE: Search, filter chips, sort, and grid/list toggle for dynamic collections.
import {
  Box, FormControl, IconButton, InputAdornment, InputLabel, MenuItem,
  Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { Search, ViewModule, ViewList, Clear } from '@mui/icons-material';

export default function SearchAndFilter({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters = [],
  view,
  onViewChange,
  sortKey,
  sortDir,
  sortOptions = [],
  onSortKey,
  countLabel,
}) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={1.5}
      alignItems={{ xs: 'stretch', md: 'center' }}
      sx={{ mb: 2 }}
    >
      {onSearch && (
        <TextField
          size="small"
          value={search || ''}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          sx={{ minWidth: { xs: '100%', md: 260 }, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => onSearch('')} aria-label="Clear search">
                  <Clear fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />
      )}
      {filters.map((filter) => (
        <FormControl key={filter.key} size="small" sx={{ minWidth: { xs: '100%', md: 160 } }}>
          <InputLabel>{filter.label}</InputLabel>
          <Select
            label={filter.label}
            value={filter.value ?? ''}
            onChange={(e) => filter.onChange(e.target.value)}
          >
            {(filter.options || []).map((opt) => (
              <MenuItem key={String(opt.value)} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      ))}
      {sortOptions.length > 0 && (
        <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 160 } }}>
          <InputLabel>Sort</InputLabel>
          <Select
            label="Sort"
            value={sortKey || ''}
            onChange={(e) => onSortKey?.(e.target.value)}
          >
            {sortOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}{sortKey === opt.value ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: { md: 'auto' } }}>
        {countLabel && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {countLabel}
          </Typography>
        )}
        {onViewChange && (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_, v) => v && onViewChange(v)}
          >
            <ToggleButton value="grid" aria-label="Grid view">
              <Tooltip title="Grid"><ViewModule fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view">
              <Tooltip title="List"><ViewList fontSize="small" /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>
    </Stack>
  );
}
