/**
 * Sample code: Hello World with PostgreSQL and MongoDB connectivity.
 */

const { getPostgresVersion } = require("./postgres-service");
const { getMongoVersion } = require("./mongo-service");

/**
 * PostgreSQL configuration loaded from environment variables with sensible defaults.
 *
 * @type {Object}
 */
const pgConfig = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  user: process.env.POSTGRES_USER || "test",
  password: process.env.POSTGRES_PASS || "test",
  database: process.env.POSTGRES_NAME || "test",
  connectionTimeout: 15,
};

/**
 * MongoDB configuration loaded from environment variables.
 * Null when MONGO_HOST is not set (e.g. DocumentDB disabled on AWS).
 *
 * @type {Object|null}
 */
const _mongoHost = process.env.MONGO_HOST || "";
const mongoConfig = _mongoHost ? {
  host: _mongoHost,
  port: parseInt(process.env.MONGO_PORT || "27017"),
  user: process.env.MONGO_USER || "",
  password: process.env.MONGO_PASS || "",
  database: process.env.MONGO_NAME || "",
  isLocal: process.env.IS_LOCAL === "true",
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
} : null;

/**
 * Sample code: Hello World with PostgreSQL and MongoDB connectivity.
 *
 * @param {Object} event - The Lambda event
 * @param {Object} context - The Lambda context
 * @returns {Promise<Object>} A response object with statusCode, headers, and body
 */
exports.handler = async (event, context) => {
  console.log("Received event: ", event)
  console.log("Received context: ", context)

  try {
    // Retrieve versions — MongoDB skipped if not configured
    const pgVersion = await getPostgresVersion(pgConfig);
    const mongoVersion = mongoConfig ? await getMongoVersion(mongoConfig) : null;

    // Log retrieved versions for debugging
    console.log("PostgreSQL Version: ", pgVersion);
    console.log("MongoDB Version: ", mongoVersion);

    // Return successful response with database versions
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Hello, World!",
        postgres: pgVersion,
        mongodb: mongoVersion,
      }),
    };
  } catch (error) {
    // Return error response on any exception
    console.error("Handler error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to retrieve database versions",
        message: error.message,
      }),
    };
  }
}
