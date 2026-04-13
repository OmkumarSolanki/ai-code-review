import java.sql.*;

public class UserRepository {
    private Connection conn;

    public UserRepository(Connection conn) {
        this.conn = conn;
    }

    public ResultSet findUser(String userId) throws SQLException {
        // SQL injection via string concatenation
        String query = "SELECT * FROM users WHERE id = '" + userId + "'";
        Statement stmt = conn.createStatement();
        return stmt.executeQuery(query);
    }

    public void deleteUser(String userId) {
        try {
            String query = "DELETE FROM users WHERE id = " + userId;
            conn.createStatement().execute(query);
        } catch (SQLException e) {
            // Empty catch block - silently swallows error
        }
    }

    public ResultSet searchUsers(String name) throws SQLException {
        String query = "SELECT * FROM users WHERE name LIKE '%" + name + "%'";
        return conn.createStatement().executeQuery(query);
    }
}
