package com.example;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;

import java.util.ArrayList;
import java.util.List;

/**
 * MongoDB database service for managing connections and queries.
 *
 * This service provides a wrapper around the MongoDB Java driver for performing common
 * database operations. It manages MongoDB connections using instance fields and provides
 * methods for CRUD operations on collections.
 *
 * The service is designed to be instantiated per request or operation, with the connection
 * being managed through the lifecycle of the service instance.
 */
public class MongoService {

    private final MongoClient mongoClient;
    private final MongoDatabase database;

    /**
     * Constructs a MongoService with connection parameters.
     *
     * Establishes a connection to MongoDB using the provided connection string and
     * selects the specified database for operations.
     *
     * @param connectionString the MongoDB connection string (e.g., mongodb://user:pass@host:port)
     * @param databaseName the database name to connect to
     */
    public MongoService(String connectionString, String databaseName) {
        this.mongoClient = MongoClients.create(connectionString);
        this.database = mongoClient.getDatabase(databaseName);
    }

    /**
     * Retrieves the MongoDB version.
     *
     * Executes a buildInfo command on the admin database and extracts the version string.
     * Returns "unknown" if the version cannot be retrieved.
     *
     * @return the MongoDB version string, or "unknown" if retrieval fails
     */
    public String getVersion() {
        try {
            Document result = database.runCommand(new Document("buildInfo", 1));
            if (result != null && result.containsKey("version")) {
                return result.getString("version");
            }
            return "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }
}
