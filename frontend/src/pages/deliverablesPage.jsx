import { useEffect, useState } from "react";
import {
  Container,
  Typography,
  CircularProgress,
  Alert,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from "@mui/material";

import Deliverable from "../components/deliverable";
import {
  getDeliverables,
  createDeliverable,
} from "../services/deliverablesService";
import { getProjects } from "../services/projectsService";

const DELIVERABLE_STATUS_OPTIONS = [
  "In Progress",
  "Completed",
  "Blocked"
];

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

export default function DeliverablesPage() {
  const [deliverables, setDeliverables] =
    useState([]);
  const [projects, setProjects] = useState([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] =
    useState(false);
  const [isCreatingDeliverable, setIsCreatingDeliverable] =
    useState(false);
  const [createError, setCreateError] = useState(null);
  const [newDeliverable, setNewDeliverable] = useState({
    project_id: "",
    name: "",
    description: "",
    status: "In Progress",
    due_date: getTodayDate(),
    estimated_hours: "",
    depends_on_deliverable_id: ""
  });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  useEffect(() => {
    async function loadPageData() {
      try {
        const [deliverablesData, projectsData] =
          await Promise.all([
            getDeliverables(),
            getProjects()
          ]);

        setDeliverables(deliverablesData || []);
        setProjects(projectsData || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadPageData();
  }, []);

  async function reloadDeliverables() {
    const deliverablesData = await getDeliverables();
    setDeliverables(deliverablesData || []);
  }

  async function handleCreateDeliverable() {
    if (!newDeliverable.project_id) {
      setCreateError("Project is required");
      return;
    }

    if (!newDeliverable.name.trim()) {
      setCreateError("Name is required");
      return;
    }

    if (!newDeliverable.description.trim()) {
      setCreateError("Description is required");
      return;
    }

    if (!Number(newDeliverable.estimated_hours)) {
      setCreateError("Estimated hours must be greater than 0");
      return;
    }

    setIsCreatingDeliverable(true);
    setCreateError(null);

    try {
      await createDeliverable({
        ...newDeliverable,
        project_id: Number(newDeliverable.project_id),
        estimated_hours: Number(
          newDeliverable.estimated_hours
        ),
        depends_on_deliverable_id:
          newDeliverable.depends_on_deliverable_id
            ? Number(
                newDeliverable.depends_on_deliverable_id
              )
            : null
      });

      await reloadDeliverables();
      setIsCreateDialogOpen(false);
      setNewDeliverable({
        project_id: "",
        name: "",
        description: "",
        status: "In Progress",
        due_date: getTodayDate(),
        estimated_hours: "",
        depends_on_deliverable_id: ""
      });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreatingDeliverable(false);
    }
  }

  function handleDeliverableUpdated(updatedDeliverable) {
    setDeliverables((prevDeliverables) =>
      prevDeliverables.map((deliverable) =>
        deliverable.id === updatedDeliverable.id
          ? updatedDeliverable
          : deliverable
      )
    );
  }

  function handleDeliverableDeleted(deliverableId) {
    setDeliverables((prevDeliverables) =>
      prevDeliverables.filter(
        (deliverable) => deliverable.id !== deliverableId
      )
    );
  }

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

  return (
    <Container sx={{ mt: 4 }}>
      <Typography
        variant="h4"
        gutterBottom
      >
        My Deliverables
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          onClick={() => {
            setCreateError(null);
            setIsCreateDialogOpen(true);
          }}
        >
          Add Deliverable
        </Button>
      </Stack>

      {deliverables.map(
        (deliverable) => (
          <Deliverable
            key={deliverable.id}
            id={deliverable.id}
            projectId={deliverable.project_id}
            name={deliverable.name}
            description={deliverable.description}
            status={deliverable.status}
            dueDate={deliverable.due_date}
            estimatedHours={deliverable.estimated_hours}
            dependency={deliverable.depends_on_deliverable_id}
            showActions
            onDeliverableUpdated={handleDeliverableUpdated}
            onDeliverableDeleted={handleDeliverableDeleted}
          />
        )
      )}

      <Dialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add New Deliverable</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {createError && (
              <Alert severity="error">
                {createError}
              </Alert>
            )}

            <TextField
              select
              label="Project"
              value={newDeliverable.project_id}
              onChange={(e) =>
                setNewDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  project_id: e.target.value
                }))
              }
              fullWidth
              required
            >
              {projects.map((project) => (
                <MenuItem
                  key={project.id}
                  value={project.id}
                >
                  {project.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Name"
              value={newDeliverable.name}
              onChange={(e) =>
                setNewDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  name: e.target.value
                }))
              }
              fullWidth
              required
            />

            <TextField
              label="Description"
              value={newDeliverable.description}
              onChange={(e) =>
                setNewDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  description: e.target.value
                }))
              }
              fullWidth
              multiline
              minRows={2}
              required
            />

            <TextField
              select
              label="Status"
              value={newDeliverable.status}
              onChange={(e) =>
                setNewDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  status: e.target.value
                }))
              }
              fullWidth
            >
              {DELIVERABLE_STATUS_OPTIONS.map(
                (statusOption) => (
                  <MenuItem
                    key={statusOption}
                    value={statusOption}
                  >
                    {statusOption}
                  </MenuItem>
                )
              )}
            </TextField>

            <TextField
              label="Due Date"
              type="date"
              value={newDeliverable.due_date}
              onChange={(e) =>
                setNewDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  due_date: e.target.value
                }))
              }
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              label="Estimated Hours"
              type="number"
              value={newDeliverable.estimated_hours}
              onChange={(e) =>
                setNewDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  estimated_hours: e.target.value
                }))
              }
              fullWidth
            />

            <TextField
              select
              label="Depends On (optional)"
              value={newDeliverable.depends_on_deliverable_id}
              onChange={(e) =>
                setNewDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  depends_on_deliverable_id:
                    e.target.value
                }))
              }
              fullWidth
            >
              <MenuItem value="">None</MenuItem>
              {deliverables
                .filter(
                  (deliverable) =>
                    String(deliverable.project_id) ===
                    String(newDeliverable.project_id)
                )
                .map((deliverable) => (
                  <MenuItem
                    key={deliverable.id}
                    value={deliverable.id}
                  >
                    {deliverable.name}
                  </MenuItem>
                ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setIsCreateDialogOpen(false)}
            disabled={isCreatingDeliverable}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleCreateDeliverable}
            disabled={isCreatingDeliverable}
          >
            {isCreatingDeliverable
              ? "Creating..."
              : "Create Deliverable"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}