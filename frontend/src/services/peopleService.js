import { apiRequest } from "./api";

export function getPeople() {
  return apiRequest("/api/people-service");
}

export function getPerson(id) {
  return apiRequest(`/api/people-service/${id}`);
}

export function getPersonProjects(person_id) {
    return apiRequest(`/api/resource-service/person/${Number(person_id)}`);
}

export function createPerson(person) {
  return apiRequest("/api/people-service", {
    method: "POST",
    body: JSON.stringify(person),
  });
}

export function updatePerson(id, person) {
  return apiRequest(`/api/people-service/${id}`, {
    method: "PUT",
    body: JSON.stringify(person),
  });
}

export function deletePerson(id) {
  return apiRequest(`/api/people-service/${id}`, {
    method: "DELETE",
  });
}