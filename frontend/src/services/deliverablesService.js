import { apiRequest } from "./api";

export function getDeliverables() {
  return apiRequest("/api/deliverables-service");
}

export function getDeliverable(id) {
  return apiRequest(`/api/deliverables-service/${id}`);
}

export function getProjectDeliverables(project_id) {
    return apiRequest(`/api/deliverables-service/project/${project_id}`);
}

export function createDeliverable(data) {
  return apiRequest("/api/deliverables-service", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateDeliverable(
  id,
  data
) {
  return apiRequest(`/api/deliverables-service/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteDeliverable(id) {
  return apiRequest(`/api/deliverables-service/${id}`, {
    method: "DELETE",
  });
}