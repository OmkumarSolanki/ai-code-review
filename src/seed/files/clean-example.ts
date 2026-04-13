interface UserProfile {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export function createUserProfile(
  name: string,
  email: string
): UserProfile {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    createdAt: new Date(),
  };
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function formatUserDisplay(user: UserProfile): string {
  const dateStr = user.createdAt.toISOString().split('T')[0];
  return `${user.name} (${user.email}) - joined ${dateStr}`;
}
