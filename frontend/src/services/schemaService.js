import { apiRequest } from "./api";

export function initializeSchema() {
  return apiRequest("/api/schema-service", {
    method: "POST",
  });
}
