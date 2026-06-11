import { apiRequest } from "./api";

export function getProjects() {
  return apiRequest("/api/projects-service");
}

export function getProject(id) {
  return apiRequest(`/api/projects-service/${id}`);
}

export function getProjectResources(project_id) {
    return apiRequest(`/api/resource-service/project/${project_id}`);
}

export function assignPersonToProject(resource) {
  return apiRequest("/api/resource-service", {
    method: "POST",
    body: JSON.stringify(resource),
  });
}

export function unassignPersonFromProject(resourceId) {
  return apiRequest(`/api/resource-service/${resourceId}`, {
    method: "DELETE",
  });
}

export function createProject(project) {
  return apiRequest("/api/projects-service", {
    method: "POST",
    body: JSON.stringify(project),
  });
}

export function updateProject(id, project) {
  return apiRequest(`/api/projects-service/${id}`, {
    method: "PUT",
    body: JSON.stringify(project),
  });
}

export function deleteProject(id) {
  return apiRequest(`/api/projects-service/${id}`, {
    method: "DELETE",
  });
}