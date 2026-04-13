const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.txt': 'text',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.dockerfile': 'docker',
  '.tf': 'terraform',
  '.graphql': 'graphql',
  '.prisma': 'prisma',
  '.xml': 'xml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'env',
};

export function detectLanguage(filename: string): string {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return EXTENSION_MAP[ext] ?? 'unknown';
}

export function isBinaryContent(content: string): boolean {
  // Check first 8KB for null bytes
  const sample = content.slice(0, 8192);
  return sample.includes('\x00');
}

export function countLinesOfCode(content: string): number {
  return content.split('\n').filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return false;
    return true;
  }).length;
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/\x00/g, '')
    .replace(/[\x01-\x1f]/g, '')
    .slice(0, 255);
}
