import { Pool } from 'pg';

const pool = new Pool({ connectionString: 'postgresql://localhost/mydb' });

async function getUser(userId: string) {
  const query = `SELECT * FROM users WHERE id = '${userId}'`;
  const result = await pool.query(query);
  return result.rows[0];
}

async function searchUsers(name: string) {
  const query = "SELECT * FROM users WHERE name LIKE '%" + name + "%'";
  const result = await pool.query(query);
  return result.rows;
}

async function deleteUser(req: { params: { id: string } }) {
  const query = `DELETE FROM users WHERE id = ${req.params.id}`;
  await pool.query(query);
}

export { getUser, searchUsers, deleteUser };
