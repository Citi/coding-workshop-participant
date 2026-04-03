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
     * Closes the MongoDB client connection and releases associated resources.
     *
     * Should be called when the service is no longer needed to properly clean up
     * the connection pool and prevent resource leaks.
     */
    public void close() {
        if (mongoClient != null) {
            mongoClient.close();
        }
    }

    /**
     * Gets the MongoDB database instance for advanced operations.
     *
     * Provides access to the underlying MongoDatabase for operations not covered by
     * the service methods, such as running commands or accessing multiple collections.
     *
     * @return the MongoDatabase instance
     */
    public MongoDatabase getDatabase() {
        return database;
    }

    /**
     * Inserts a single document into the specified collection.
     *
     * @param collectionName the collection name where the document will be inserted
     * @param document the document to insert
     * @throws com.mongodb.MongoException if the insert operation fails
     */
    public void insertDocument(String collectionName, Document document) {
        MongoCollection<Document> collection = database.getCollection(collectionName);
        collection.insertOne(document);
    }

    /**
     * Retrieves all documents from the specified collection.
     *
     * @param collectionName the collection name to query
     * @return a list of all documents in the collection (empty list if collection is empty)
     * @throws com.mongodb.MongoException if the query fails
     */
    public List<Document> findAll(String collectionName) {
        MongoCollection<Document> collection = database.getCollection(collectionName);
        List<Document> results = new ArrayList<>();
        collection.find().into(results);
        return results;
    }

    /**
     * Finds the first document matching the specified filter criteria.
     *
     * @param collectionName the collection name to query
     * @param filter the filter document specifying the search criteria
     * @return the first matching document, or null if no document matches the filter
     * @throws com.mongodb.MongoException if the query fails
     */
    public Document findOne(String collectionName, Document filter) {
        MongoCollection<Document> collection = database.getCollection(collectionName);
        return collection.find(filter).first();
    }

    /**
     * Updates the first document matching the filter criteria with the provided updates.
     *
     * Uses the $set operator to update only the specified fields in the matching document.
     *
     * @param collectionName the collection name containing the document to update
     * @param filter the filter document specifying which document to update
     * @param update the update document containing the fields and values to set
     * @return the number of documents modified (0 or 1)
     * @throws com.mongodb.MongoException if the update operation fails
     */
    public long updateDocument(String collectionName, Document filter, Document update) {
        MongoCollection<Document> collection = database.getCollection(collectionName);
        return collection.updateOne(filter, new Document("$set", update)).getModifiedCount();
    }

    /**
     * Deletes the first document matching the specified filter criteria.
     *
     * @param collectionName the collection name containing the document to delete
     * @param filter the filter document specifying which document to delete
     * @return the number of documents deleted (0 or 1)
     * @throws com.mongodb.MongoException if the delete operation fails
     */
    public long deleteDocument(String collectionName, Document filter) {
        MongoCollection<Document> collection = database.getCollection(collectionName);
        return collection.deleteOne(filter).getDeletedCount();
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
