import { Box, Typography, Paper } from "@mui/material";

export default function CompetitorRadar() {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Competitor Radar
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Track companies and get alerts when their ads or landing pages change.
      </Typography>
      <Paper sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
        <Typography variant="body2">
          Competitor tracking and change alerts (e.g. via tauri-plugin-notification) will be available in a future update.
          Use Ad Explorer to search and save ads by source for manual tracking.
        </Typography>
      </Paper>
    </Box>
  );
}
