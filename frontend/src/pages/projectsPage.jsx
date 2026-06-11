import { useEffect, useState } from "react";

import {
  Container,
  Typography,
  CircularProgress,
  Alert,
  TextField,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem
} from "@mui/material";

import Project from "../components/project";
import {
  getProjects,
  createProject
} from "../services/projectsService";

const PROJECT_STATUS_OPTIONS = [
  "In Progress",
  "At Risk",
  "Completed"
];

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] =
    useState(false);
  const [isCreatingProject, setIsCreatingProject] =
    useState(false);
  const [createError, setCreateError] = useState(null);
  const [newProject, setNewProject] = useState({
    name: "",
    status: "In Progress",
    start_date: getTodayDate(),
    end_date: getTodayDate(),
    budget_planned: ""
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await getProjects();
        setProjects(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadProjects();
  }, []);

  // Filter logic
  const filteredProjects = (projects || []).filter((project) => {
    if (!searchTerm) return true;

    return project.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
  });

  if (loading) {
    return (
      <Container sx={{ mt: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">
          {error}
        </Alert>
      </Container>
    );
  }

  async function handleCreateProject() {
    if (!newProject.name.trim()) {
      setCreateError("Project name is required");
      return;
    }

    setIsCreatingProject(true);
    setCreateError(null);

    try {
      const payload = {
        ...newProject,
        budget_planned: Number(newProject.budget_planned) || 0
      };

      const createdProject = await createProject(payload);

      setProjects((prevProjects) => [
        createdProject,
        ...(prevProjects || [])
      ]);

      setIsCreateDialogOpen(false);
      setNewProject({
        name: "",
        status: "In Progress",
        start_date: getTodayDate(),
        end_date: getTodayDate(),
        budget_planned: ""
      });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreatingProject(false);
    }
  }

  function handleProjectUpdated(updatedProject) {
    setProjects((prevProjects) =>
      prevProjects.map((project) =>
        project.id === updatedProject.id
          ? updatedProject
          : project
      )
    );
  }

  function handleProjectDeleted(projectId) {
    setProjects((prevProjects) =>
      prevProjects.filter(
        (project) => project.id !== projectId
      )
    );
  }

  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Projects
      </Typography>

      {/* SEARCH BAR */}
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <TextField
          fullWidth
          label="Search projects"
          value={searchTerm}
          onChange={(e) =>
            setSearchTerm(e.target.value)
          }
        />

        <Button
          variant="outlined"
          onClick={() => setSearchTerm("")}
        >
          Show All
        </Button>

        <Button
          variant="contained"
          onClick={() => {
            setCreateError(null);
            setIsCreateDialogOpen(true);
          }}
        >
          Add Project
        </Button>
      </Stack>

      {/* RESULTS */}
      {filteredProjects.length === 0 ? (
        <Alert severity="info">
          No projects found
        </Alert>
      ) : (
        filteredProjects.map((project) => (
          <Project
            key={project.id}
            id={project.id}
            name={project.name}
            status={project.status}
            startDate={project.start_date}
            endDate={project.end_date}
            budget={project.budget_planned}
            onProjectUpdated={handleProjectUpdated}
            onProjectDeleted={handleProjectDeleted}
          />
        ))
      )}

      <Dialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add New Project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {createError && (
              <Alert severity="error">
                {createError}
              </Alert>
            )}

            <TextField
              label="Project Name"
              value={newProject.name}
              onChange={(e) =>
                setNewProject((prevProject) => ({
                  ...prevProject,
                  name: e.target.value
                }))
              }
              fullWidth
              required
            />

            <TextField
              select
              label="Status"
              value={newProject.status}
              onChange={(e) =>
                setNewProject((prevProject) => ({
                  ...prevProject,
                  status: e.target.value
                }))
              }
              fullWidth
            >
              {PROJECT_STATUS_OPTIONS.map((statusOption) => (
                <MenuItem
                  key={statusOption}
                  value={statusOption}
                >
                  {statusOption}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Start Date"
              type="date"
              value={newProject.start_date}
              onChange={(e) =>
                setNewProject((prevProject) => ({
                  ...prevProject,
                  start_date: e.target.value
                }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              label="End Date"
              type="date"
              value={newProject.end_date}
              onChange={(e) =>
                setNewProject((prevProject) => ({
                  ...prevProject,
                  end_date: e.target.value
                }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              label="Planned Budget"
              type="number"
              value={newProject.budget_planned}
              onChange={(e) =>
                setNewProject((prevProject) => ({
                  ...prevProject,
                  budget_planned: e.target.value
                }))
              }
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setIsCreateDialogOpen(false)}
            disabled={isCreatingProject}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleCreateProject}
            disabled={isCreatingProject}
          >
            {isCreatingProject
              ? "Creating..."
              : "Create Project"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}