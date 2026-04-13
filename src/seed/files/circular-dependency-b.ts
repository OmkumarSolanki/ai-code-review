import { getUser } from './circular-dependency-a';

export function formatName(first: string, last: string): string {
  return `${first} ${last}`;
}

export function getUserFullInfo(id: string) {
  const user = getUser(id);
  return { ...user, formatted: formatName('test', 'user') };
}
