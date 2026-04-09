/**
 * MongoDB database configuration and connection management.
 *
 * This module handles MongoDB connection pooling using module-level variables
 * to reuse connections across Lambda invocations, improving performance and reducing
 * cold start time.
 */

const { MongoClient } = require("mongodb");

/**
 * Module-level MongoDB client for connection pooling across Lambda invocations.
 * Persists between invocations within the same Lambda container.
 * @type {MongoClient|null}
 */
let mongoClient = null;

/**
 * Retrieves the MongoDB version using connection pooling.
 *
 * Reuses the module-level mongoClient across invocations for better performance.
 * Executes the admin.buildInfo command to retrieve version information.
 * On connection failure or command error, resets the client to null and throws the error.
 *
 * Connection pooling strategy:
 * - First invocation: Creates a new MongoDB client and stores it in mongoClient
 * - Subsequent invocations: Reuses the existing client
 * - On error: Resets mongoClient to null to force reconnection on next invocation
 *
 * @param {*} config MongoDB configuration object with host, port, user, password
 * @returns {Promise<string>} The MongoDB version string, or "unknown" if retrieval fails
 * @throws {Error} If connection or command fails
 */
async function getMongoVersion(config) {
  try {
    // Build MongoDB connection URI — include credentials only when provided
    const auth = config.user ? `${config.user}:${config.password}@` : "";
    const uri = `mongodb://${auth}${config.host}:${config.port}`;

    // Create client if not already pooled
    if (!mongoClient) {
      mongoClient = new MongoClient(uri, {
        serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
        socketTimeoutMS: config.socketTimeoutMS,
        ...(config.isLocal ? {} : { tls: true, tlsAllowInvalidCertificates: true, retryWrites: false }),
      });
      await mongoClient.connect();
    }

    // Execute buildInfo command and extract version
    const info = await mongoClient.db("admin").command({ buildInfo: 1 });
    return info.version || "unknown";
  } catch (error) {
    // Connection or command failed - reset client and throw error
    console.error("MongoDB error:", error.message);
    mongoClient = null;
    throw error;
  }
}

module.exports = {
  getMongoVersion,
};
