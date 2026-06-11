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
  DialogActions
} from "@mui/material";

import Person from "../components/people";

import {
  getPeople,
  createPerson
} from "../services/peopleService";

export default function PeoplePage() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] =
    useState(false);
  const [isCreatingPerson, setIsCreatingPerson] =
    useState(false);
  const [createError, setCreateError] = useState(null);
  const [newPerson, setNewPerson] = useState({
    name: "",
    role: "",
    hourly_rate: ""
  });

  useEffect(() => {
    async function loadPeople() {
      try {
        const data = await getPeople();

        setPeople(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadPeople();
  }, []);

  // Filter logic
  const filteredPeople = (people || []).filter((person) => {
    if (!searchTerm) return true;

    return person.name
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

  async function handleCreatePerson() {
    if (!newPerson.name.trim()) {
      setCreateError("Person name is required");
      return;
    }

    if (!newPerson.role.trim()) {
      setCreateError("Person role is required");
      return;
    }

    setIsCreatingPerson(true);
    setCreateError(null);

    try {
      const payload = {
        ...newPerson,
        hourly_rate: Number(newPerson.hourly_rate) || 0
      };

      const createdPerson = await createPerson(payload);

      setPeople((prevPeople) => [
        createdPerson,
        ...(prevPeople || [])
      ]);

      setIsCreateDialogOpen(false);
      setNewPerson({
        name: "",
        role: "",
        hourly_rate: ""
      });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreatingPerson(false);
    }
  }

  function handlePersonUpdated(updatedPerson) {
    setPeople((prevPeople) =>
      prevPeople.map((person) =>
        person.id === updatedPerson.id
          ? updatedPerson
          : person
      )
    );
  }

  function handlePersonDeleted(personId) {
    setPeople((prevPeople) =>
      prevPeople.filter(
        (person) => person.id !== personId
      )
    );
  }

  return (
    <Container sx={{ mt: 4 }}>
      <Typography
        variant="h4"
        gutterBottom
      >
        Team Members
      </Typography>

      <Stack direction="row" spacing={2} mb={2}>
      <TextField
                fullWidth
                label="Search people"
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
          Add Person
        </Button>
      </Stack>

      {filteredPeople.map((person) => (
        <Person
          key={person.id}
          id={person.id}
          name={person.name}
          role={person.role}
          hourlyRate={person.hourly_rate}
          onPersonUpdated={handlePersonUpdated}
          onPersonDeleted={handlePersonDeleted}
        />
      ))}

      <Dialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add New Person</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {createError && (
              <Alert severity="error">
                {createError}
              </Alert>
            )}

            <TextField
              label="Name"
              value={newPerson.name}
              onChange={(e) =>
                setNewPerson((prevPerson) => ({
                  ...prevPerson,
                  name: e.target.value
                }))
              }
              fullWidth
              required
            />

            <TextField
              label="Role"
              value={newPerson.role}
              onChange={(e) =>
                setNewPerson((prevPerson) => ({
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
              value={newPerson.hourly_rate}
              onChange={(e) =>
                setNewPerson((prevPerson) => ({
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
            onClick={() => setIsCreateDialogOpen(false)}
            disabled={isCreatingPerson}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={handleCreatePerson}
            disabled={isCreatingPerson}
          >
            {isCreatingPerson
              ? "Creating..."
              : "Create Person"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}