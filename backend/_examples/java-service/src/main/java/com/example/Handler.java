package com.example;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.bson.Document;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Sample code: Hello World with PostgreSQL and MongoDB connectivity.
 */
public class Handler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    /** Gson instance for JSON serialization */
    private static final Gson gson = new GsonBuilder().create();

    /**
     * Sample code: Hello World with PostgreSQL and MongoDB connectivity.
     *
     * @param event the Lambda event
     * @param context the Lambda context
     * @return a response map with statusCode, headers, and body
     */
    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        try {
            // Retrieve versions in parallel for better performance
            CompletableFuture<String> pgFuture = CompletableFuture.supplyAsync(this::getPostgresVersion);
            CompletableFuture<String> mongoFuture = CompletableFuture.supplyAsync(this::getMongoVersion);

            // Wait for both futures to complete
            String pgVersion = pgFuture.join();
            String mongoVersion = mongoFuture.join();

            // Build response body with database versions
            Map<String, String> body = new HashMap<>();
            body.put("message", "Hello, World!");
            body.put("postgres", pgVersion);
            body.put("mongodb", mongoVersion);

            // Build HTTP response with 200 status code
            Map<String, Object> response = new HashMap<>();
            response.put("statusCode", 200);

            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Type", "application/json");
            response.put("headers", headers);
            response.put("body", gson.toJson(body));

            return response;
        } catch (Exception e) {
            // Return 500 error response on unexpected exceptions
            return errorResponse(500, "Internal server error: " + e.getMessage());
        }
    }

    /**
     * Builds an error response with the specified status code and message.
     *
     * @param statusCode the HTTP status code (e.g., 500 for internal server error)
     * @param message the error message to include in the response body
     * @return a response map formatted for proxy integration
     */
    private static Map<String, Object> errorResponse(int statusCode, String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("statusCode", statusCode);

        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        response.put("headers", headers);

        Map<String, String> body = new HashMap<>();
        body.put("error", message);
        response.put("body", gson.toJson(body));

        return response;
    }

    /**
     * Retrieves the PostgreSQL version using the PostgresService.
     *
     * @return the PostgreSQL version string, or "unknown" if retrieval fails
     */
    private String getPostgresVersion() {
        try {
            String host = getEnvOrDefault("POSTGRES_HOST", "localhost");
            int port = Integer.parseInt(getEnvOrDefault("POSTGRES_PORT", "5432"));
            String user = getEnvOrDefault("POSTGRES_USER", "test");
            String password = getEnvOrDefault("POSTGRES_PASS", "test");
            String database = getEnvOrDefault("POSTGRES_NAME", "test");

            PostgresService service = new PostgresService(host, port, database, user, password);
            service.connect();

            try {
                return service.getVersion();
            } finally {
                service.disconnect();
            }
        } catch (Exception e) {
            return "unknown";
        }
    }

    /**
     * Retrieves the MongoDB version using the MongoService.
     * Returns null when MONGO_HOST is not set (e.g. DocumentDB disabled on AWS).
     *
     * @return the MongoDB version string, null if not configured, or "unknown" on error
     */
    private String getMongoVersion() {
        String host = System.getenv("MONGO_HOST");
        if (host == null || host.isEmpty()) {
            return null;
        }
        try {
            int port = Integer.parseInt(getEnvOrDefault("MONGO_PORT", "27017"));
            String user = System.getenv("MONGO_USER");
            String password = System.getenv("MONGO_PASS");
            String database = getEnvOrDefault("MONGO_NAME", "admin");
            boolean isLocal = "true".equals(System.getenv("IS_LOCAL"));

            // Include credentials only when provided
            String auth = (user != null && !user.isEmpty())
                ? user + ":" + password + "@"
                : "";
            // TLS required for DocumentDB on AWS, disabled locally
            String tls = isLocal
                ? ""
                : "?tls=true&tlsAllowInvalidCertificates=true&retryWrites=false";
            String connectionString = String.format(
                "mongodb://%s%s:%d/%s%s",
                auth, host, port, database, tls
            );

            MongoService service = new MongoService(connectionString, database);
            try {
                return service.getVersion();
            } finally {
                service.close();
            }
        } catch (Exception e) {
            return "unknown";
        }
    }

    /**
     * Helper method to get environment variable value or return default.
     *
     * @param key the environment variable name
     * @param defaultValue the default value if environment variable is not set
     * @return the environment variable value or default value
     */
    private static String getEnvOrDefault(String key, String defaultValue) {
        String value = System.getenv(key);
        return value != null ? value : defaultValue;
    }

    /**
     * Main method with no arguments to test functionality locally.
     *
     * @param args command line arguments (unused)
     */
    public static void main(String[] args) {
        Handler handler = new Handler();
        Map<String, Object> event = new HashMap<>();
        Map<String, Object> result = handler.handleRequest(event, null);
        System.out.println(gson.toJson(result));
    }
}
