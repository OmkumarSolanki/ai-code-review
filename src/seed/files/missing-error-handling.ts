async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return data;
}

async function processMultipleFiles(files: string[]) {
  const results = await Promise.all(
    files.map(file => fetch(`/api/files/${file}`).then(r => r.json()))
  );
  return results;
}

async function updateProfile(userId: string, profile: Record<string, unknown>) {
  await fetch(`/api/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
  const updated = await fetch(`/api/users/${userId}`);
  return updated.json();
}

export { fetchUserData, processMultipleFiles, updateProfile };
