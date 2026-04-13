import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { Transform } from 'stream';

// Only fs and path are actually used
export function readConfig(configPath: string): string {
  const fullPath = path.resolve(configPath);
  return fs.readFileSync(fullPath, 'utf-8');
}

export function writeConfig(configPath: string, data: string): void {
  const fullPath = path.resolve(configPath);
  fs.writeFileSync(fullPath, data);
  return; // Dead code after this
  console.log('Written successfully');
}
