/**
 * PostgreSQL database configuration and connection management.
 *
 * This module handles PostgreSQL connection pooling using module-level variables
 * to reuse connections across Lambda invocations, improving performance and reducing
 * cold start time.
 */

const { Client } = require("pg");

/**
 * Module-level PostgreSQL client for connection pooling across Lambda invocations.
 * Persists between invocations within the same Lambda container.
 * @type {Client|null}
 */
let pgClient = null;

/**
 * Retrieves the PostgreSQL version using connection pooling.
 *
 * Reuses the module-level pgClient across invocations for better performance.
 * Executes "SELECT version();" query to retrieve the version string.
 * On connection failure or query error, resets the client to null and throws the error.
 *
 * Connection pooling strategy:
 * - First invocation: Creates a new client and stores it in pgClient
 * - Subsequent invocations: Reuses the existing client
 * - On error: Resets pgClient to null to force reconnection on next invocation
 *
 * @param {*} config PostgreSQL configuration object with host, port, user, password
 * @returns {Promise<string>} The PostgreSQL version string, or "unknown" if retrieval fails
 * @throws {Error} If connection or query fails
 */
async function getPostgresVersion(config) {
  try {
    // Create connection if not already pooled
    if (!pgClient) {
      pgClient = new Client(config);
      await pgClient.connect();
    }

    // Execute version query and extract result
    const res = await pgClient.query("SELECT version();");
    return res.rows[0]?.version || "unknown";
  } catch (error) {
    // Connection or query failed - reset client and throw error
    console.error("PostgreSQL error:", error.message);
    pgClient = null;
    throw error;
  }
}

module.exports = {
  getPostgresVersion,
};
