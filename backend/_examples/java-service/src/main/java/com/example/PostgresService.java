package com.example;

import java.sql.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * PostgreSQL database service for managing connections and queries.
 *
 * This service provides a wrapper around the PostgreSQL JDBC driver for performing common
 * database operations. It manages connections using instance fields and provides methods
 * for CRUD operations and custom SQL execution.
 *
 * The service uses prepared statements to prevent SQL injection and automatically handles
 * resource cleanup through try-with-resources statements.
 */
public class PostgresService {

    private final String url;
    private final String username;
    private final String password;
    private Connection connection;

    /**
     * Constructs a PostgresService with connection parameters.
     *
     * Builds the JDBC connection URL from the provided parameters but does not
     * establish the connection. Call {@link #connect()} to establish the connection.
     *
     * @param host the PostgreSQL server hostname or IP address
     * @param port the PostgreSQL server port (typically 5432)
     * @param database the database name to connect to
     * @param username the database user for authentication
     * @param password the database password for authentication
     */
    public PostgresService(String host, int port, String database, String username, String password) {
        this.url = String.format("jdbc:postgresql://%s:%d/%s", host, port, database);
        this.username = username;
        this.password = password;
    }

    /**
     * Establishes a connection to the PostgreSQL database.
     *
     * Creates a new connection using the configured URL, username, and password.
     * This method must be called before any database operations.
     *
     * @throws SQLException if the connection fails (e.g., invalid credentials, server unavailable)
     */
    public void connect() throws SQLException {
        connection = DriverManager.getConnection(url, username, password);
    }

    /**
     * Closes the database connection and releases associated resources.
     *
     * Safely closes the connection if it exists and is not already closed.
     * Should be called when the service is no longer needed, typically in a finally block.
     *
     * @throws SQLException if closing the connection fails
     */
    public void disconnect() throws SQLException {
        if (connection != null && !connection.isClosed()) {
            connection.close();
        }
    }

    /**
     * Checks if the connection is currently active and open.
     *
     * @return true if the connection is established and open, false otherwise
     * @throws SQLException if checking the connection status fails
     */
    public boolean isConnected() throws SQLException {
        return connection != null && !connection.isClosed();
    }

    /**
     * Inserts a row into the specified table with the provided column values.
     *
     * Automatically generates the INSERT statement from the provided data map and
     * uses prepared statements to prevent SQL injection. Returns the auto-generated
     * primary key if available.
     *
     * @param table the table name where the row will be inserted
     * @param data a map of column names to values to insert
     * @return the auto-generated primary key value, or -1 if no key was generated
     * @throws SQLException if the insert operation fails
     */
    public int insert(String table, Map<String, Object> data) throws SQLException {
        StringBuilder columns = new StringBuilder();
        StringBuilder placeholders = new StringBuilder();
        List<Object> values = new ArrayList<>();

        for (Map.Entry<String, Object> entry : data.entrySet()) {
            if (columns.length() > 0) {
                columns.append(", ");
                placeholders.append(", ");
            }
            columns.append(entry.getKey());
            placeholders.append("?");
            values.add(entry.getValue());
        }

        String sql = String.format("INSERT INTO %s (%s) VALUES (%s)", table, columns, placeholders);
        try (PreparedStatement stmt = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            for (int i = 0; i < values.size(); i++) {
                stmt.setObject(i + 1, values.get(i));
            }
            stmt.executeUpdate();
            try (ResultSet generatedKeys = stmt.getGeneratedKeys()) {
                if (generatedKeys.next()) {
                    return generatedKeys.getInt(1);
                }
            }
        }
        return -1;
    }

    /**
     * Finds rows in the specified table matching the filter criteria.
     *
     * Constructs a SELECT query with WHERE clause based on the filter map. All filter
     * conditions are combined with AND operators. Returns results as a list of maps
     * where each map represents a row with column names as keys.
     *
     * @param table the table name to query
     * @param filter a map of column names to filter values (empty map returns all rows)
     * @return a list of rows as maps, where each map contains column names and values
     * @throws SQLException if the query fails
     */
    public List<Map<String, Object>> find(String table, Map<String, Object> filter) throws SQLException {
        StringBuilder whereClause = new StringBuilder();
        List<Object> values = new ArrayList<>();

        for (Map.Entry<String, Object> entry : filter.entrySet()) {
            if (whereClause.length() > 0) whereClause.append(" AND ");
            whereClause.append(entry.getKey()).append(" = ?");
            values.add(entry.getValue());
        }

        String sql = "SELECT * FROM " + table + (whereClause.length() > 0 ? " WHERE " + whereClause : "");
        List<Map<String, Object>> results = new ArrayList<>();

        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.size(); i++) {
                stmt.setObject(i + 1, values.get(i));
            }
            try (ResultSet rs = stmt.executeQuery()) {
                ResultSetMetaData meta = rs.getMetaData();
                int columnCount = meta.getColumnCount();
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    for (int i = 1; i <= columnCount; i++) {
                        row.put(meta.getColumnName(i), rs.getObject(i));
                    }
                    results.add(row);
                }
            }
        }
        return results;
    }

    /**
     * Updates rows in the specified table matching the filter criteria.
     *
     * Constructs an UPDATE statement that sets the columns specified in the updates map
     * for all rows matching the filter criteria. All filter conditions are combined with
     * AND operators.
     *
     * @param table the table name containing rows to update
     * @param filter a map of column names to filter values (WHERE clause)
     * @param updates a map of column names to new values (SET clause)
     * @return the number of rows updated
     * @throws SQLException if the update operation fails
     */
    public int update(String table, Map<String, Object> filter, Map<String, Object> updates) throws SQLException {
        StringBuilder setClause = new StringBuilder();
        StringBuilder whereClause = new StringBuilder();
        List<Object> values = new ArrayList<>();

        for (Map.Entry<String, Object> entry : updates.entrySet()) {
            if (setClause.length() > 0) setClause.append(", ");
            setClause.append(entry.getKey()).append(" = ?");
            values.add(entry.getValue());
        }

        for (Map.Entry<String, Object> entry : filter.entrySet()) {
            if (whereClause.length() > 0) whereClause.append(" AND ");
            whereClause.append(entry.getKey()).append(" = ?");
            values.add(entry.getValue());
        }

        String sql = String.format("UPDATE %s SET %s WHERE %s", table, setClause, whereClause);
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.size(); i++) {
                stmt.setObject(i + 1, values.get(i));
            }
            return stmt.executeUpdate();
        }
    }

    /**
     * Deletes rows from the specified table matching the filter criteria.
     *
     * Constructs a DELETE statement for all rows matching the filter criteria.
     * All filter conditions are combined with AND operators.
     *
     * @param table the table name containing rows to delete
     * @param filter a map of column names to filter values (WHERE clause)
     * @return the number of rows deleted
     * @throws SQLException if the delete operation fails
     */
    public int delete(String table, Map<String, Object> filter) throws SQLException {
        StringBuilder whereClause = new StringBuilder();
        List<Object> values = new ArrayList<>();

        for (Map.Entry<String, Object> entry : filter.entrySet()) {
            if (whereClause.length() > 0) whereClause.append(" AND ");
            whereClause.append(entry.getKey()).append(" = ?");
            values.add(entry.getValue());
        }

        String sql = "DELETE FROM " + table + (whereClause.length() > 0 ? " WHERE " + whereClause : "");
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.size(); i++) {
                stmt.setObject(i + 1, values.get(i));
            }
            return stmt.executeUpdate();
        }
    }

    /**
     * Executes a custom SQL query with optional parameters.
     *
     * Allows execution of arbitrary SELECT queries with parameterized values to prevent
     * SQL injection. Results are returned as a list of maps where each map represents
     * a row with column names as keys.
     *
     * Example: {@code service.executeQuery("SELECT * FROM users WHERE age > ?", 18)}
     *
     * @param sql the SQL query string with ? placeholders for parameters
     * @param params the query parameters to bind to the placeholders
     * @return a list of rows as maps, where each map contains column names and values
     * @throws SQLException if the query fails
     */
    public List<Map<String, Object>> executeQuery(String sql, Object... params) throws SQLException {
        List<Map<String, Object>> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                stmt.setObject(i + 1, params[i]);
            }
            try (ResultSet rs = stmt.executeQuery()) {
                ResultSetMetaData meta = rs.getMetaData();
                int columnCount = meta.getColumnCount();
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    for (int i = 1; i <= columnCount; i++) {
                        row.put(meta.getColumnName(i), rs.getObject(i));
                    }
                    results.add(row);
                }
            }
        }
        return results;
    }

    /**
     * Executes a custom SQL update statement with optional parameters.
     *
     * Allows execution of arbitrary INSERT, UPDATE, or DELETE statements with parameterized
     * values to prevent SQL injection.
     *
     * Example: {@code service.executeUpdate("UPDATE users SET name = ? WHERE id = ?", "John", 1)}
     *
     * @param sql the SQL update string with ? placeholders for parameters
     * @param params the query parameters to bind to the placeholders
     * @return the number of rows affected by the update
     * @throws SQLException if the update fails
     */
    public int executeUpdate(String sql, Object... params) throws SQLException {
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                stmt.setObject(i + 1, params[i]);
            }
            return stmt.executeUpdate();
        }
    }

    /**
     * Retrieves the PostgreSQL version.
     *
     * Executes a version query and extracts the version string from the result.
     * Returns "unknown" if the version cannot be retrieved.
     *
     * @return the PostgreSQL version string, or "unknown" if retrieval fails
     * @throws SQLException if the query fails
     */
    public String getVersion() throws SQLException {
        List<Map<String, Object>> result = executeQuery("SELECT version();");
        if (!result.isEmpty()) {
            Map<String, Object> row = result.get(0);
            return row.values().iterator().next().toString();
        }
        return "unknown";
    }
}
