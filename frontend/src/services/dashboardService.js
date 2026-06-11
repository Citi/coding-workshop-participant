import { apiRequest } from "./api";

export function getProjectCost(project_id) {
    return apiRequest(`/api/dashboard-service/cost/${project_id}`);
}