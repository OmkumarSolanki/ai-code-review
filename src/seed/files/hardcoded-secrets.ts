const AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE1";
const AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

const DB_CONNECTION = "postgresql://admin:password123456@db.example.com:5432/production";

const config = {
  apiKey: "sk-proj-1234567890abcdefghijklmn",
  secret: "super_secret_value_do_not_share",
  jwtSecret: "my-jwt-secret-key-here",
};

function connectToDatabase() {
  const password = "root_password_123";
  return `mysql://root:${password}@localhost:3306/app`;
}

export { config, connectToDatabase };
