const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_TOTAL_SIZE_MB = parseInt(process.env.MAX_TOTAL_SIZE_MB || '50', 10);
const MAX_FILES_PER_REVIEW = parseInt(process.env.MAX_FILES_PER_REVIEW || '100', 10);

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb',
  '.cpp', '.c', '.h', '.cs', '.php', '.swift', '.kt', '.scala',
  '.sql', '.html', '.css', '.json', '.yaml', '.yml', '.md', '.txt',
  '.sh', '.bash', '.zsh', '.dockerfile', '.tf', '.graphql', '.prisma',
  '.xml', '.toml', '.ini', '.env',
]);

export interface FileInput {
  filename: string;
  content: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateFiles(files: FileInput[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (files.length > MAX_FILES_PER_REVIEW) {
    errors.push({
      field: 'files',
      message: `Too many files. Maximum is ${MAX_FILES_PER_REVIEW}.`,
    });
  }

  let totalSize = 0;

  for (const file of files) {
    const sizeBytes = Buffer.byteLength(file.content, 'utf-8');
    const sizeMB = sizeBytes / (1024 * 1024);
    totalSize += sizeMB;

    if (sizeMB > MAX_FILE_SIZE_MB) {
      errors.push({
        field: file.filename,
        message: `File exceeds ${MAX_FILE_SIZE_MB}MB limit.`,
      });
    }

    const ext = '.' + file.filename.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push({
        field: file.filename,
        message: `File extension ${ext} is not allowed.`,
      });
    }
  }

  if (totalSize > MAX_TOTAL_SIZE_MB) {
    errors.push({
      field: 'files',
      message: `Total upload size exceeds ${MAX_TOTAL_SIZE_MB}MB limit.`,
    });
  }

  return errors;
}
