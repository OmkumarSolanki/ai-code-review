interface User { id: string; name: string; }
interface Post { id: string; authorId: string; title: string; }

async function getUsersWithPosts(db: any): Promise<any[]> {
  const users = await db.query('SELECT * FROM users');
  const result = [];

  // N+1: one query per user inside a loop
  for (const user of users) {
    const posts = await db.query(`SELECT * FROM posts WHERE author_id = '${user.id}'`);
    result.push({ ...user, posts });
  }

  return result;
}

async function getCommentsForPosts(db: any, postIds: string[]): Promise<any[]> {
  const allComments = [];
  for (const id of postIds) {
    const comments = await db.query(`SELECT * FROM comments WHERE post_id = '${id}'`);
    allComments.push(...comments);
  }
  return allComments;
}

export { getUsersWithPosts, getCommentsForPosts };
