import { formatName } from './circular-dependency-b';

export function getUser(id: string) {
  return { id, name: formatName('John', 'Doe') };
}

export function getUserDisplay(id: string): string {
  const user = getUser(id);
  return `User: ${user.name}`;
}
