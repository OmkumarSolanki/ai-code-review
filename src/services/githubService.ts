/**
 * GitHub integration — fetch files from repos, PRs, and single file URLs.
 * Uses GitHub REST API (no auth needed for public repos).
 */

export interface GitHubFile {
  filename: string;
  content: string;
}

export interface GitHubImportResult {
  type: 'repo' | 'pr' | 'file';
  owner: string;
  repo: string;
  ref?: string;
  prNumber?: number;
  files: GitHubFile[];
}

// File extensions we care about
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb',
  '.cpp', '.c', '.h', '.cs', '.php', '.swift', '.kt', '.scala',
  '.sql', '.html', '.css', '.json', '.yaml', '.yml', '.sh', '.bash',
  '.dockerfile', '.tf', '.graphql', '.prisma', '.toml',
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__', '.next',
  'vendor', 'target', '.idea', '.vscode', 'coverage', '.cache',
]);

function isCodeFile(path: string): boolean {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

function shouldSkip(path: string): boolean {
  return path.split('/').some(part => SKIP_DIRS.has(part) || part.startsWith('.'));
}

/**
 * Parse a GitHub URL into its components.
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch/path
 *   https://github.com/owner/repo/blob/branch/path/file.ts
 *   https://github.com/owner/repo/pull/123
 */
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  type: 'repo' | 'pr' | 'file' | 'tree';
  ref?: string;
  path?: string;
  prNumber?: number;
} {
  // Clean up URL
  const cleaned = url.trim().replace(/\/$/, '');

  const match = cleaned.match(
    /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/(?:(pull)\/(\d+)|(?:(blob|tree)\/([^\/]+)\/?(.*)?)))?$/
  );

  if (!match) throw new Error('Invalid GitHub URL. Please enter a valid github.com link.');

  const [, owner, repo, pullStr, prNum, blobOrTree, ref, path] = match;

  if (pullStr === 'pull' && prNum) {
    return { owner, repo, type: 'pr', prNumber: parseInt(prNum) };
  }

  if (blobOrTree === 'blob' && ref && path) {
    return { owner, repo, type: 'file', ref, path };
  }

  if (blobOrTree === 'tree' && ref) {
    return { owner, repo, type: 'tree', ref, path: path || '' };
  }

  // Just owner/repo
  return { owner, repo, type: 'repo', ref: 'main' };
}

/**
 * Fetch files from a GitHub URL (repo, PR, or single file).
 */
export async function fetchFromGitHub(url: string, token?: string): Promise<GitHubImportResult> {
  const parsed = parseGitHubUrl(url);
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'CodeReview-AI',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  switch (parsed.type) {
    case 'file':
      return fetchSingleFile(parsed.owner, parsed.repo, parsed.ref!, parsed.path!, headers);

    case 'pr':
      return fetchPRFiles(parsed.owner, parsed.repo, parsed.prNumber!, headers);

    case 'tree':
      return fetchTree(parsed.owner, parsed.repo, parsed.ref!, parsed.path || '', headers);

    case 'repo':
    default:
      return fetchRepoFiles(parsed.owner, parsed.repo, parsed.ref || 'main', headers);
  }
}

async function ghFetch(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 404) throw new Error('Repository or file not found. Make sure it\'s a public repo.');
    if (res.status === 403) throw new Error('GitHub API rate limit exceeded. Try again later or add a GitHub token.');
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchSingleFile(
  owner: string, repo: string, ref: string, path: string, headers: Record<string, string>
): Promise<GitHubImportResult> {
  const data = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    headers
  );

  if (data.type !== 'file' || !data.content) {
    throw new Error('URL does not point to a file');
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return {
    type: 'file',
    owner, repo, ref,
    files: [{ filename: data.path || path, content }],
  };
}

async function fetchPRFiles(
  owner: string, repo: string, prNumber: number, headers: Record<string, string>
): Promise<GitHubImportResult> {
  // Fetch PR files (paginated, up to 100)
  const data = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    headers
  );

  const files: GitHubFile[] = [];
  for (const file of data) {
    if (file.status === 'removed') continue;
    if (!isCodeFile(file.filename)) continue;
    if (shouldSkip(file.filename)) continue;

    // Fetch full content via raw URL
    try {
      if (file.raw_url) {
        const res = await fetch(file.raw_url, { headers: { 'User-Agent': 'CodeReview-AI' } });
        if (res.ok) {
          const content = await res.text();
          if (content.length <= 1024 * 1024) { // Skip files > 1MB
            files.push({ filename: file.filename, content });
          }
        }
      }
    } catch {
      // Skip files we can't fetch
    }
  }

  if (files.length === 0) throw new Error('No code files found in this PR');

  return { type: 'pr', owner, repo, prNumber, files };
}

async function fetchRepoFiles(
  owner: string, repo: string, ref: string, headers: Record<string, string>
): Promise<GitHubImportResult> {
  return fetchTree(owner, repo, ref, '', headers);
}

async function fetchTree(
  owner: string, repo: string, ref: string, basePath: string, headers: Record<string, string>
): Promise<GitHubImportResult> {
  // Use Git Tree API with recursive flag
  const data = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
    headers
  );

  if (!data.tree) throw new Error('Could not read repository tree');

  const codeFiles = data.tree.filter((item: any) => {
    if (item.type !== 'blob') return false;
    if (!isCodeFile(item.path)) return false;
    if (shouldSkip(item.path)) return false;
    if (basePath && !item.path.startsWith(basePath)) return false;
    if ((item.size || 0) > 512 * 1024) return false; // Skip files > 512KB
    return true;
  });

  // Limit to 50 files to avoid rate limiting and huge requests
  const toFetch = codeFiles.slice(0, 50);

  const files: GitHubFile[] = [];
  for (const item of toFetch) {
    try {
      const blob = await ghFetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${ref}`,
        headers
      );
      if (blob.content) {
        const content = Buffer.from(blob.content, 'base64').toString('utf-8');
        files.push({ filename: item.path, content });
      }
    } catch {
      // Skip files we can't fetch
    }
  }

  if (files.length === 0) throw new Error('No code files found in this repository');

  return { type: 'repo', owner, repo, ref, files };
}
