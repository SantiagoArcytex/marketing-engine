import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { VerifiedEmailRow, VerifyResult } from "../shared/schema";
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

export default function EmailIntelligence() {
  const [singleEmail, setSingleEmail] = useState("");
  const [singleResult, setSingleResult] = useState<VerifyResult | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [bulkPath, setBulkPath] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<VerifiedEmailRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const loadVerified = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await api.getVerifiedEmails({
        statusFilter: statusFilter || undefined,
        limit: 2000,
      });
      setRows(list);
    } catch (e) {
      setError(String(e));
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadVerified();
  }, [loadVerified]);

  async function handleVerifySingle() {
    if (!singleEmail.trim()) return;
    setSingleLoading(true);
    setError(null);
    setSingleResult(null);
    try {
      const result = await api.verifyEmailAndStore(singleEmail.trim());
      setSingleResult(result);
      await loadVerified();
    } catch (e) {
      setError(String(e));
    } finally {
      setSingleLoading(false);
    }
  }

  async function handleBulkVerify() {
    if (!bulkPath.trim()) {
      setError("Enter a file path (one email per line or CSV with email column)");
      return;
    }
    setBulkLoading(true);
    setError(null);
    setBulkCount(null);
    try {
      const count = await api.verifyBulk(bulkPath.trim());
      setBulkCount(count);
      await loadVerified();
    } catch (e) {
      setError(String(e));
    } finally {
      setBulkLoading(false);
    }
  }

  const columnDefs: ColDef<VerifiedEmailRow>[] = [
    { field: "email", headerName: "Email", flex: 1 },
    { field: "status", headerName: "Status", width: 120 },
    { field: "quality", headerName: "Quality", width: 100 },
    { field: "verified_at", headerName: "Verified at", width: 180 },
  ];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Email Intelligence
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Single verification
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="Email"
            value={singleEmail}
            onChange={(e) => setSingleEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerifySingle()}
            placeholder="user@example.com"
            sx={{ minWidth: 280 }}
          />
          <Button
            variant="contained"
            onClick={handleVerifySingle}
            disabled={singleLoading || !singleEmail.trim()}
          >
            {singleLoading ? <CircularProgress size={24} /> : "Verify"}
          </Button>
          {singleResult && (
            <Typography variant="body2" color="text.secondary">
              Status: {singleResult.status} · Quality: {singleResult.quality}
            </Typography>
          )}
        </Box>
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Bulk verification
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="File path (TXT/CSV, one email per line)"
            value={bulkPath}
            onChange={(e) => setBulkPath(e.target.value)}
            placeholder="/path/to/emails.txt"
            sx={{ minWidth: 320 }}
          />
          <Button
            variant="contained"
            onClick={handleBulkVerify}
            disabled={bulkLoading || !bulkPath.trim()}
          >
            {bulkLoading ? <CircularProgress size={24} /> : "Verify bulk"}
          </Button>
          {bulkCount !== null && (
            <Typography variant="body2" color="text.secondary">
              Verified {bulkCount} emails
            </Typography>
          )}
        </Box>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="ok">Ok</MenuItem>
            <MenuItem value="invalid">Invalid</MenuItem>
            <MenuItem value="disposable">Disposable</MenuItem>
            <MenuItem value="catch_all">Catch-all</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={loadVerified} disabled={loadingList}>
          Refresh list
        </Button>
      </Box>
      <Box className="ag-theme-quartz" sx={{ height: 400, width: "100%" }}>
        {loadingList ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%">
            <CircularProgress />
          </Box>
        ) : (
          <AgGridReact<VerifiedEmailRow>
            rowData={rows}
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
