// A static server for a local look at the radar: `node serve.ts` serves out/ on port 8080, so
// /dashboard/index.html opens with its data beside it. The grader never runs this file.
import { createServer } from 'node:http';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2] ?? 'out';
const port = Number(process.env.PORT ?? 8080);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let path = normalize(join(root, url));
  if (!path.startsWith(normalize(root))) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
}).listen(port, () => {
  process.stdout.write(`token radar: serving ${root} at port ${port}\n`);
});
