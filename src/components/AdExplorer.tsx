import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client";
import type { AdRow } from "../shared/schema";
import type { PatternStats } from "../shared/schema";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import type { ColDef } from "ag-grid-community";
import PatternCharts from "./PatternCharts";

export default function AdExplorer() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdRow[]>([]);
  const [sourceFilter, setSourceFilter] = useState("");
  const [hookFilter, setHookFilter] = useState<string>("");
  const [emotionFilter, setEmotionFilter] = useState<string>("");
  const [offerFilter, setOfferFilter] = useState<string>("");
  const [patternStats, setPatternStats] = useState<PatternStats | null>(null);

  const loadAds = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const list = await api.listAds({
        sourceFilter: sourceFilter || undefined,
        limit: 500,
      });
      setRows(list);
    } catch (e) {
      setError(String(e));
      if (!String(e).includes("invoke")) setRows([]);
    } finally {
      setLoadingList(false);
    }
  }, [sourceFilter]);

  const loadPatternStats = useCallback(async () => {
    try {
      const stats = await api.getPatternStats();
      setPatternStats(stats ?? null);
    } catch {
      setPatternStats(null);
    }
  }, []);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  useEffect(() => {
    loadPatternStats();
  }, [loadPatternStats]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (hookFilter) r = r.filter((row) => row.hook === hookFilter);
    if (emotionFilter) r = r.filter((row) => row.emotion === emotionFilter);
    if (offerFilter) r = r.filter((row) => row.offer === offerFilter);
    return r;
  }, [rows, hookFilter, emotionFilter, offerFilter]);

  const uniqueHooks = useMemo(() => [...new Set(rows.map((r) => r.hook).filter(Boolean))] as string[], [rows]);
  const uniqueEmotions = useMemo(() => [...new Set(rows.map((r) => r.emotion).filter(Boolean))] as string[], [rows]);
  const uniqueOffers = useMemo(() => [...new Set(rows.map((r) => r.offer).filter(Boolean))] as string[], [rows]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.scrapeAds({ query: query.trim() });
      await loadAds();
      await loadPatternStats();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      await api.analyzePatterns(null);
      await loadAds();
      await loadPatternStats();
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  const columnDefs: ColDef<AdRow>[] = [
    { field: "id", headerName: "ID", width: 80 },
    { field: "content", headerName: "Content", flex: 1, wrapText: true, autoHeight: true },
    { field: "hook", headerName: "Hook", width: 120 },
    { field: "emotion", headerName: "Emotion", width: 100 },
    { field: "offer", headerName: "Offer", width: 120 },
    { field: "audience", headerName: "Audience", width: 100 },
    { field: "source", headerName: "Source", width: 120 },
    { field: "created_at", headerName: "Date", width: 160 },
  ];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Ad Explorer
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="Search keyword"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. AI tools"
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
          >
            {loading ? <CircularProgress size={24} /> : "Scrape ads"}
          </Button>
          <Button
            variant="outlined"
            onClick={handleAnalyze}
            disabled={analyzing || loadingList}
          >
            {analyzing ? <CircularProgress size={24} /> : "Analyze patterns"}
          </Button>
          <TextField
            size="small"
            label="Filter by source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            placeholder="Optional"
          />
          <Button variant="outlined" onClick={loadAds} disabled={loadingList}>
            Refresh list
          </Button>
        </Box>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mt: 2 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Hook</InputLabel>
            <Select
              value={hookFilter}
              label="Hook"
              onChange={(e) => setHookFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {uniqueHooks.map((h) => (
                <MenuItem key={h} value={h}>{h}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Emotion</InputLabel>
            <Select
              value={emotionFilter}
              label="Emotion"
              onChange={(e) => setEmotionFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {uniqueEmotions.map((e) => (
                <MenuItem key={e} value={e}>{e}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Offer</InputLabel>
            <Select
              value={offerFilter}
              label="Offer"
              onChange={(e) => setOfferFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {uniqueOffers.map((o) => (
                <MenuItem key={o} value={o}>{o}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <PatternCharts stats={patternStats} />
      <Box className="ag-theme-quartz" sx={{ height: 400, width: "100%", mt: 2 }}>
        {loadingList ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%">
            <CircularProgress />
          </Box>
        ) : (
          <AgGridReact<AdRow>
            rowData={filteredRows}
            columnDefs={columnDefs}
            defaultColDef={{ resizable: true }}
            domLayout="normal"
            animateRows
          />
        )}
      </Box>
    </Box>
  );
}
