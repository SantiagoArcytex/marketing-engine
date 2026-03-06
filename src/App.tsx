import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  TextField,
  Button,
  Paper,
  CssBaseline,
  AppBar,
  Toolbar,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import ExploreIcon from "@mui/icons-material/Explore";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import EmailIcon from "@mui/icons-material/Email";
import PsychologyIcon from "@mui/icons-material/Psychology";
import CreateIcon from "@mui/icons-material/Create";
import RadarIcon from "@mui/icons-material/Radar";
import AdExplorer from "./components/AdExplorer";
import EmailIntelligence from "./components/EmailIntelligence";
import StrategyOrchestrator from "./components/StrategyOrchestrator";
import FunnelAnalyzer from "./components/FunnelAnalyzer";
import CopywritingGenerator from "./components/CopywritingGenerator";
import CompetitorRadar from "./components/CompetitorRadar";
import "./App.css";

const darkTheme = createTheme({ palette: { mode: "dark" } });
const DRAWER_WIDTH = 260;

const MODULES = [
  { id: "ad-explorer", label: "Ad Explorer", icon: <ExploreIcon /> },
  { id: "funnel-analyzer", label: "Funnel Analyzer", icon: <AccountTreeIcon /> },
  { id: "email-intelligence", label: "Email Intelligence", icon: <EmailIcon /> },
  { id: "strategy-orchestrator", label: "Strategy Orchestrator", icon: <PsychologyIcon /> },
  { id: "copywriting-generator", label: "Copywriting Generator", icon: <CreateIcon /> },
  { id: "competitor-radar", label: "Competitor Radar", icon: <RadarIcon /> },
] as const;

function App() {
  const [activeModule, setActiveModule] = useState<string>(MODULES[0].id);
  const [greetName, setGreetName] = useState("");
  const [greetMsg, setGreetMsg] = useState("");

  async function greet() {
    try {
      const msg = await invoke<string>("greet", { name: greetName || "World" });
      setGreetMsg(msg);
    } catch (e) {
      setGreetMsg(`Error: ${String(e)}`);
    }
  }

  return (
    <ThemeProvider theme={darkTheme}>
    <Box sx={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      <CssBaseline />
      <AppBar position="static" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <Typography variant="h6" component="span">
            Marketing Intelligence Engine
          </Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: 1,
            borderColor: "divider",
            top: "auto",
          },
        }}
      >
        <Box sx={{ overflow: "auto", py: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" px={2} pb={1}>
            Modules
          </Typography>
          <List>
            {MODULES.map((m) => (
              <ListItemButton
                key={m.id}
                selected={activeModule === m.id}
                onClick={() => setActiveModule(m.id)}
              >
                <ListItemIcon>{m.icon}</ListItemIcon>
                <ListItemText primary={m.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          ml: 0,
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          overflow: "auto",
        }}
      >
        {activeModule === "ad-explorer" ? (
          <AdExplorer />
        ) : activeModule === "email-intelligence" ? (
          <EmailIntelligence />
        ) : activeModule === "strategy-orchestrator" ? (
          <StrategyOrchestrator />
        ) : activeModule === "funnel-analyzer" ? (
          <FunnelAnalyzer />
        ) : activeModule === "copywriting-generator" ? (
          <CopywritingGenerator />
        ) : activeModule === "competitor-radar" ? (
          <CompetitorRadar />
        ) : (
          <>
            <Typography variant="h4" gutterBottom>
              Marketing Intelligence Engine
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Local intelligence platform for marketing research. Select a module from the sidebar.
            </Typography>
            <Paper sx={{ p: 3, mt: 2, maxWidth: 480 }}>
              <Typography variant="h6" gutterBottom>
                Backend test (greet)
              </Typography>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <TextField
                  size="small"
                  label="Name"
                  value={greetName}
                  onChange={(e) => setGreetName(e.target.value)}
                  placeholder="Enter a name..."
                />
                <Button variant="contained" onClick={greet}>
                  Greet
                </Button>
              </Box>
              {greetMsg && (
                <Typography variant="body2" sx={{ mt: 2 }}>
                  {greetMsg}
                </Typography>
              )}
            </Paper>
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" color="text.secondary">
                Active module: {MODULES.find((m) => m.id === activeModule)?.label ?? activeModule}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                (Placeholder — full UI per module in later phases)
              </Typography>
            </Box>
          </>
        )}
      </Box>
      </Box>
    </Box>
    </ThemeProvider>
  );
}

export default App;
