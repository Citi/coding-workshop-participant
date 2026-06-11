const API_BASE_URL =
  import.meta.env.VITE_API_URL;

export async function apiRequest(
  endpoint,
  options = {}
) {
    console.log(`Making API request to: ${API_BASE_URL}${endpoint}`);
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    }
  );

  if (!response.ok) {
    throw new Error(
      `API Error: ${response.status}`
    );
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  const responseText = await response.text();
  if (!responseText) {
    return null;
  }

  const parsed = JSON.parse(responseText);
  return parsed;
}