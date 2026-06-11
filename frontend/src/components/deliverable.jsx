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
  MenuItem,
  Alert
} from "@mui/material";
import { useState, useEffect } from "react";
import {
  getDeliverable,
  updateDeliverable,
  deleteDeliverable
} from "../services/deliverablesService";

const DELIVERABLE_STATUS_OPTIONS = [
  "In Progress",
  "Completed",
  "Blocked"
];

export default function Deliverable({
  id,
  projectId,
  name,
  description,
  status,
  dueDate,
  estimatedHours,
  dependency,
  showActions = false,
  onDeliverableUpdated,
  onDeliverableDeleted
}) {
  const [dependencyName, setDependency] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] =
    useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [editDeliverable, setEditDeliverable] = useState({
    project_id: projectId,
    name,
    description,
    status,
    due_date: dueDate,
    estimated_hours: estimatedHours,
    depends_on_deliverable_id: dependency || null
  });

  useEffect(() => {
    setEditDeliverable({
      project_id: projectId,
      name,
      description,
      status,
      due_date: dueDate,
      estimated_hours: estimatedHours,
      depends_on_deliverable_id: dependency || null
    });
  }, [
    projectId,
    name,
    description,
    status,
    dueDate,
    estimatedHours,
    dependency
  ]);

  const getStatusColor = () => {
    switch (status) {
      case "Completed":
        return "success";

      case "In Progress":
        return "warning";

      default:
        return "default";
    }
  };

  useEffect(() => {
    async function loadDependency() {
      if (dependency) {
        try {
          const data = await getDeliverable(dependency);
          setDependency(data.name);
        } catch (err) {
          console.error("Failed to load dependency:", err);
        }
      }
    }

    loadDependency();
  }, [dependency]);

  async function handleUpdateDeliverable() {
    if (!editDeliverable.name?.trim()) {
      setActionError("Deliverable name is required");
      return;
    }

    if (!editDeliverable.description?.trim()) {
      setActionError("Description is required");
      return;
    }

    if (!Number(editDeliverable.estimated_hours)) {
      setActionError("Estimated hours must be greater than 0");
      return;
    }

    setIsUpdating(true);
    setActionError(null);

    try {
      const payload = {
        ...editDeliverable,
        estimated_hours: Number(
          editDeliverable.estimated_hours
        )
      };

      const updatedDeliverable = await updateDeliverable(
        id,
        payload
      );

      if (onDeliverableUpdated) {
        onDeliverableUpdated(updatedDeliverable);
      }

      setIsEditDialogOpen(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDeleteDeliverable() {
    const shouldDelete = window.confirm(
      `Delete deliverable \"${name}\"?`
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);

    try {
      await deleteDeliverable(id);

      if (onDeliverableDeleted) {
        onDeliverableDeleted(id);
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack
          direction="row"
          justifyContent="space-between"
        >
          <Typography variant="h6">
            {name}
          </Typography>

          <Chip
            label={status}
            color={getStatusColor()}
          />
        </Stack>

        <Typography
          variant="body2"
          sx={{ mt: 1 }}
        >
          Due: {dueDate}
        </Typography>
        {dependency && (
          <Typography
            variant="body2"
            sx={{ mt: 0.5 }}
          >
            Depends on: {dependencyName}
          </Typography>
        )}

        {showActions && (
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
              onClick={handleDeleteDeliverable}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </Stack>
        )}

        {actionError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {actionError}
          </Alert>
        )}
      </CardContent>

      <Dialog
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Update Deliverable</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={editDeliverable.name}
              onChange={(e) =>
                setEditDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  name: e.target.value
                }))
              }
              fullWidth
              required
            />

            <TextField
              label="Description"
              value={editDeliverable.description || ""}
              onChange={(e) =>
                setEditDeliverable((prevDeliverable) => ({
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
              value={editDeliverable.status}
              onChange={(e) =>
                setEditDeliverable((prevDeliverable) => ({
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
              value={editDeliverable.due_date || ""}
              onChange={(e) =>
                setEditDeliverable((prevDeliverable) => ({
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
              value={editDeliverable.estimated_hours ?? ""}
              onChange={(e) =>
                setEditDeliverable((prevDeliverable) => ({
                  ...prevDeliverable,
                  estimated_hours: e.target.value
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
            onClick={handleUpdateDeliverable}
            disabled={isUpdating}
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}