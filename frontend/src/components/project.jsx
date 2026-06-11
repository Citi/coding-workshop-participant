import { useEffect, useState } from "react";

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

import { getProjectDeliverables } from "../services/deliverablesService";
import { getProjectCost } from "../services/dashboardService";
import {
  getProjectResources,
  assignPersonToProject,
  unassignPersonFromProject,
  updateProject,
  deleteProject
} from "../services/projectsService";
import {
  getPerson,
  getPeople
} from "../services/peopleService";

import Deliverable from "./deliverable";

const PROJECT_STATUS_OPTIONS = [
  "In Progress",
  "At Risk",
  "Completed"
];

export default function Project({
  id,
  name,
  status,
  startDate,
  endDate,
  budget,
  onProjectUpdated,
  onProjectDeleted
}) {
  const [deliverables, setDeliverables] = useState([]);
  const [projectBudget, setProjectBudget] = useState(0);
  const [assignedPeople, setAssignedPeople] = useState([]);
  const [allPeople, setAllPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] =
    useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState(20);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] =
    useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [editProject, setEditProject] = useState({
    name,
    status,
    start_date: startDate,
    end_date: endDate,
    budget_planned: budget
  });

  useEffect(() => {
    setEditProject({
      name,
      status,
      start_date: startDate,
      end_date: endDate,
      budget_planned: budget
    });
  }, [name, status, startDate, endDate, budget]);

  const getStatusColor = () => {
    switch (status) {
      case "Completed":
        return "success";

      case "In Progress":
        return "warning";

      case "At Risk":
        return "error";

      default:
        return "default";
    }
  };

  useEffect(() => {
    async function loadProjectBudget() {
      try {
        const data = await getProjectCost(id);


        setProjectBudget(data?.budget ?? 0);
      } catch (err) {
        console.error("Failed to load project budget:", err);
      }
    }

    loadProjectBudget();
  }, [id]);

  useEffect(() => {
    async function loadPeopleDirectory() {
      try {
        const data = await getPeople();
        setAllPeople(data || []);
      } catch (err) {
        console.error("Failed to load people:", err);
      }
    }

    loadPeopleDirectory();
  }, [id]);

  async function loadAssignedPeople() {
    try {
      const allocations = await getProjectResources(id) || [];

      const peopleDetails = await Promise.all(
        allocations.map(async (allocation) => {
          const person = await getPerson(
            allocation.person_id
          );

          return {
            ...person,
            resourceId: allocation.id,
            hoursPerWeek: allocation.hours_per_week
          };
        })
      );

      setAssignedPeople(peopleDetails);
    } catch (err) {
      console.error("Failed to load assigned people:", err);
    }
  }

  useEffect(() => {
    loadAssignedPeople();
  }, [id]);

  useEffect(() => {
  async function loadDeliverables() {
    try {
      const data = await getProjectDeliverables(id);

      setDeliverables(data || []);
    } catch (err) {
      console.error("Failed to load deliverables:", err);
    }
  }

  loadDeliverables();
}, [id]);

  async function handleUpdateProject() {
    if (!editProject.name.trim()) {
      setActionError("Project name is required");
      return;
    }

    setIsUpdating(true);
    setActionError(null);

    try {
      const payload = {
        ...editProject,
        budget_planned:
          Number(editProject.budget_planned) || 0
      };

      const updatedProject = await updateProject(
        id,
        payload
      );

      onProjectUpdated(updatedProject);
      setIsEditDialogOpen(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDeleteProject() {
    const shouldDelete = window.confirm(
      `Delete project \"${name}\"?`
    );

    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);

    try {
      await deleteProject(id);
      onProjectDeleted(id);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleAssignPerson() {
    if (!selectedPersonId) {
      setActionError("Select a person to assign");
      return;
    }

    if (!Number(hoursPerWeek)) {
      setActionError("Hours per week must be greater than 0");
      return;
    }

    setIsAssigning(true);
    setActionError(null);

    try {
      await assignPersonToProject({
        person_id: Number(selectedPersonId),
        project_id: id,
        hours_per_week: Number(hoursPerWeek)
      });

      setSelectedPersonId("");
      setHoursPerWeek(20);
      await loadAssignedPeople();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleUnassignPerson(resourceId) {
    setActionError(null);

    try {
      await unassignPersonFromProject(resourceId);
      await loadAssignedPeople();
    } catch (err) {
      setActionError(err.message);
    }
  }

  const assignedPersonIds = new Set(
    assignedPeople.map((person) =>
      Number(person.id)
    )
  );

  const availablePeople = allPeople.filter(
    (person) => !assignedPersonIds.has(Number(person.id))
  );

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h6">
            {name}
          </Typography>

          <Chip
            label={status}
            color={getStatusColor()}
          />
        </Stack>

        <Typography variant="body2" sx={{ mt: 1 }}>
          Start: {startDate}
        </Typography>

        <Typography variant="body2">
          End: {endDate}
        </Typography>

        <Typography variant="body2">
          Budget: ${budget?.toLocaleString()}
        </Typography>
        <Typography variant="body2">
          Consumed Budget: ${projectBudget?.toLocaleString()}
        </Typography>

        <Typography variant="body2" sx={{ mt: 1 }}>
          Assigned People:
        </Typography>

        {assignedPeople.length === 0 ? (
          <Typography variant="body2">
            None assigned
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {assignedPeople.map((person) => (
              <Stack
                key={person.resourceId}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Chip
                  label={`${person.name} (${person.hoursPerWeek}h/wk)`}
                  variant="outlined"
                />
                <Button
                  size="small"
                  color="error"
                  variant="text"
                  onClick={() =>
                    handleUnassignPerson(
                      person.resourceId
                    )
                  }
                >
                  Unassign
                </Button>
              </Stack>
            ))}
          </Stack>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <TextField
            select
            size="small"
            label="Assign person"
            value={selectedPersonId}
            onChange={(e) =>
              setSelectedPersonId(e.target.value)
            }
            sx={{ minWidth: 220 }}
          >
            {availablePeople.map((person) => (
              <MenuItem
                key={person.id}
                value={person.id}
              >
                {person.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            type="number"
            label="Hours/week"
            value={hoursPerWeek}
            onChange={(e) =>
              setHoursPerWeek(e.target.value)
            }
            sx={{ width: 140 }}
          />

          <Button
            size="small"
            variant="contained"
            onClick={handleAssignPerson}
            disabled={isAssigning || availablePeople.length === 0}
          >
            {isAssigning ? "Assigning..." : "Assign"}
          </Button>
        </Stack>

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
            onClick={handleDeleteProject}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </Stack>
      </CardContent>
      {deliverables.map((deliverable) => (
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
        />
      ))}

      <Dialog
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Update Project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Project Name"
              value={editProject.name}
              onChange={(e) =>
                setEditProject((prevProject) => ({
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
              value={editProject.status}
              onChange={(e) =>
                setEditProject((prevProject) => ({
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
              value={editProject.start_date || ""}
              onChange={(e) =>
                setEditProject((prevProject) => ({
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
              value={editProject.end_date || ""}
              onChange={(e) =>
                setEditProject((prevProject) => ({
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
              value={editProject.budget_planned ?? ""}
              onChange={(e) =>
                setEditProject((prevProject) => ({
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
            onClick={() => setIsEditDialogOpen(false)}
            disabled={isUpdating}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleUpdateProject}
            disabled={isUpdating}
          >
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}