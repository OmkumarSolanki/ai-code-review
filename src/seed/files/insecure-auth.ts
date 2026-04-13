import jwt from 'jsonwebtoken';

// Hardcoded JWT secret
const JWT_SECRET = "my-super-secret-jwt-key-12345";

interface User {
  id: string;
  email: string;
  password: string;
}

// No password hashing - stores plain text
async function createUser(email: string, password: string): Promise<User> {
  const user = {
    id: Math.random().toString(36),
    email,
    password: password, // stored as plain text!
  };
  return user;
}

// Token never expires
function generateToken(user: User): string {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET);
}

async function login(email: string, password: string): Promise<string> {
  const user = await findUser(email);
  if (user.password === password) {
    return generateToken(user);
  }
  throw new Error('Invalid credentials');
}

async function findUser(email: string): Promise<User> {
  return { id: '1', email, password: 'admin123' };
}

export { createUser, generateToken, login };
