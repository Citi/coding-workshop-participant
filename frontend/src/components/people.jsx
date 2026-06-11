import {
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert
} from "@mui/material";

import {
  getPersonProjects,
  updatePerson,
  deletePerson
} from "../services/peopleService";
import { getProject } from "../services/projectsService";
import { useState, useEffect } from "react";

export default function Person({
  id,
  name,
  role,
  hourlyRate,
  onPersonUpdated,
  onPersonDeleted
}) {
    const [projects, setProjects] = useState([]);
    const [hours, setHours] = useState(0);
    const [isEditDialogOpen, setIsEditDialogOpen] =
      useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [editPerson, setEditPerson] = useState({
      name,
      role,
      hourly_rate: hourlyRate
    });

    useEffect(() => {
      setEditPerson({
        name,
        role,
        hourly_rate: hourlyRate
      });
    }, [name, role, hourlyRate]);

    useEffect(() => {
            async function loadProject() {
        try {
            const allocations = await getPersonProjects(id) || [];

            const totalHours = allocations.reduce(
                (sum, allocation) => sum + allocation.hours_per_week,
                0
            );

            setHours(totalHours);

            const projectPromises = allocations.map((allocation) =>
                getProject(allocation.project_id)
            );

            const projectData = await Promise.all(projectPromises);

            setProjects(projectData);
        } catch (err) {
            console.error("Failed to load person's projects:", err);
        }
    }
        loadProject();
    }, [id]);

  const isOverAllocated = hours > 40;

  async function handleUpdatePerson() {
    if (!editPerson.name.trim()) {
      setActionError("Person name is required");
      return;
    }

    if (!editPerson.role.trim()) {
      setActionError("Person role is required");
      return;
    }

    setIsUpdating(true);
    setActionError(null);

    try {
      const payload = {
        ...editPerson,
        hourly_rate:
          Number(editPerson.hourly_rate) || 0
      };

      const updatedPerson = await updatePerson(id, payload);

      onPersonUpdated(updatedPerson);
      setIsEditDialogOpen(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDeletePerson() {
    const shouldDelete = window.confirm(
      `Delete team member \"${name}\"?`
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);

    try {
      await deletePerson(id);
      onPersonDeleted(id);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card
      sx={{
        mb: 2,
        ...(isOverAllocated
          ? {
              border: "2px solid",
              borderColor: "error.main"
            }
          : {})
      }}
    >
      <CardContent>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h6">
            {name}
          </Typography>

        </Stack>
        <Typography variant="body2">
          Role: {role}
        </Typography>
        <Typography variant="body2">
          Hourly Rate: ${hourlyRate}/hr
        </Typography>
        <Typography variant="body2">
          Hours per week: {hours}
        </Typography>

        {isOverAllocated && (
          <Typography
            variant="body2"
            color="error.main"
            sx={{ fontWeight: 700 }}
          >
            Overallocated: more than 40 hours/week
          </Typography>
        )}

        {actionError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {actionError}
          </Alert>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setActionError(null);
              setIsEditDialogOpen(true);
            }}
          >
            Update
          </Button>

          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={handleDeletePerson}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </Stack>

        {projects.map((project) => (
        <Chip
            key={project.id}
            label={project.name}
            sx={{ mt: 1, mr: 1 }}
        />
        ))}
      </CardContent>

      <Dialog
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Update Person</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={editPerson.name}
              onChange={(e) =>
                setEditPerson((prevPerson) => ({
                  ...prevPerson,
                  name: e.target.value
                }))
              }
              fullWidth
              required
            />

            <TextField
              label="Role"
              value={editPerson.role}
              onChange={(e) =>
                setEditPerson((prevPerson) => ({
                  ...prevPerson,
                  role: e.target.value
                }))
              }
              fullWidth
              required
            />

            <TextField
              label="Hourly Rate"
              type="number"
              value={editPerson.hourly_rate ?? ""}
              onChange={(e) =>
                setEditPerson((prevPerson) => ({
                  ...prevPerson,
                  hourly_rate: e.target.value
                }))
              }
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setIsEditDialogOpen(false)}
            disabled={isUpdating}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleUpdatePerson}
            disabled={isUpdating}
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}