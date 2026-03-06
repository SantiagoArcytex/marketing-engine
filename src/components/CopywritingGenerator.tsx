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

export default function CopywritingGenerator() {
  const [hook, setHook] = useState("");
  const [offer, setOffer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setVariants([]);
    try {
      const result = await api.generateCopyVariants({
        hook: hook.trim() || undefined,
        offer: offer.trim() || undefined,
      });
      setVariants(result ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Copywriting Generator
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Generate ad copy variants from hooks and offers (template-based).
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="Hook"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="e.g. Save time"
          />
          <TextField
            size="small"
            label="Offer"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="e.g. Free trial"
          />
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : "Generate variants"}
          </Button>
        </Box>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {variants.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Variants</Typography>
          {variants.map((v, i) => (
            <Typography key={i} variant="body2" sx={{ mb: 1 }}>{v}</Typography>
          ))}
        </Paper>
      )}
    </Box>
  );
}
