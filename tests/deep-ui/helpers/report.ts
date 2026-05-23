import fs from 'fs';
import path from 'path';

export function writeJsonArtifact(folder: string, fileName: string, data: unknown): void {
  const dir = path.join('qa-artifacts', folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(data, null, 2));
}

export function appendMarkdownReport(fileName: string, markdown: string): void {
  const dir = path.join('qa-artifacts', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, fileName), markdown + '\n');
}
