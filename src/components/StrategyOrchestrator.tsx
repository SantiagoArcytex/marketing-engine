import { useState } from "react";
import { api } from "../api/client";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  CircularProgress,
  Alert,
} from "@mui/material";

export default function StrategyOrchestrator() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string>("");

  async function handleRun() {
    setLoading(true);
    setError(null);
    setReport("");
    try {
      const result = await api.runStrategyAgent(
        query.trim() || "General marketing strategy"
      );
      setReport(result ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Strategy Orchestrator
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Get data-driven strategy and key takeaways from your ads and email verification data.
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="Query or focus"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRun()}
            placeholder="e.g. B2B SaaS launch, ecommerce hooks"
            multiline
            minRows={2}
            sx={{ minWidth: 320, flex: 1 }}
          />
          <Button
            variant="contained"
            onClick={handleRun}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : "Run agent"}
          </Button>
        </Box>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {report && (
        <Paper sx={{ p: 3, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.9rem" }}>
          {report}
        </Paper>
      )}
    </Box>
  );
}
