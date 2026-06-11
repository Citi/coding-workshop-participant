import { Link } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Stack,
} from "@mui/material";

export default function Navbar() {
  return (
    <AppBar position="fixed">
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Project Tracker
        </Typography>

        <Stack direction="row" spacing={1}>
          <Button color="inherit" component={Link} to="/projects">
            Projects
          </Button>

          <Button color="inherit" component={Link} to="/people">
            People
          </Button>

          <Button color="inherit" component={Link} to="/deliverables">
            Deliverables
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}