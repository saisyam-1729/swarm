// PURPOSE: Reusable historical telemetry chart for a single series.
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import EmptyState from '../common/EmptyState';
import { ShowChart } from '@mui/icons-material';

export default function TelemetryChart({
  data = [],
  dataKey = 'value',
  xKey = 'time',
  name = 'Reading',
  height = 360,
  unit,
}) {
  const theme = useTheme();
  if (!data.length) {
    return (
      <EmptyState
        title="No readings in this range"
        description="Trends appear after devices ingest telemetry for the selected sensor."
        icon={<ShowChart />}
        compact
      />
    );
  }

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: theme.palette.text.secondary }} />
          <YAxis
            tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
            unit={unit ? ` ${unit}` : undefined}
            width={64}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
            }}
            formatter={(value) => [unit ? `${value} ${unit}` : value, name]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={theme.palette.primary.main}
            strokeWidth={2}
            dot={data.length < 40}
            name={name}
          />
        </LineChart>
      </ResponsiveContainer>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {data.length} point{data.length === 1 ? '' : 's'}
      </Typography>
    </Box>
  );
}
