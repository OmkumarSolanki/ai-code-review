import java.sql.*;

public class DatabaseConfig {
    private static final String DB_URL = "jdbc:mysql://localhost:3306/production";
    private static final String DB_USER = "root";
    private static final String DB_PASSWORD = "admin_password_12345";

    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
    }

    public static void runCommand(String userInput) {
        try {
            // Shell injection via Runtime.exec with user input
            Runtime.getRuntime().exec("cmd /c " + userInput);
        } catch (Exception e) {
            System.out.println("Command failed");
        }
    }

    public static void backup(String filename) {
        try {
            Runtime.getRuntime().exec("mysqldump -u root -padmin_password_12345 production > " + filename);
        } catch (Exception e) {
            // Empty catch
        }
    }
}
