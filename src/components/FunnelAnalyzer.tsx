import { Box, Typography, Paper } from "@mui/material";

export default function FunnelAnalyzer() {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Funnel Analyzer
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Reconstruct competitor funnels: ad → landing page → offer → CTA.
      </Typography>
      <Paper sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
        <Typography variant="body2">
          Funnel reconstruction from scraped data will be available in a future update.
          Scrape ads in Ad Explorer to populate data; funnel steps (landing page, offer, CTA) can be linked when those fields are added.
        </Typography>
      </Paper>
    </Box>
  );
}
