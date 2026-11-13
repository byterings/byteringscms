// Minimal, dependency-free POSIX ustar writer/reader for backups of the media
// storage directory (regular files and directories only). Avoids depending on
// whichever `tar` binary happens to be installed on the host.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const BLOCK = 512;

function octal(value, length) {
  return value.toString(8).padStart(length - 1, '0') + '\0';
}

function splitName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  const cut = name.lastIndexOf('/', 155);
  if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) {
    throw new Error(`Path too long for ustar: ${name}`);
  }
  return { name: name.slice(cut + 1), prefix: name.slice(0, cut) };
}

function header(path, size, type, mtime) {
  const buf = Buffer.alloc(BLOCK);
  const { name, prefix } = splitName(path);
  buf.write(name, 0, 100, 'utf8');
  buf.write(octal(type === '5' ? 0o755 : 0o644, 8), 100, 'ascii');
  buf.write(octal(0, 8), 108, 'ascii');
  buf.write(octal(0, 8), 116, 'ascii');
  buf.write(octal(size, 12), 124, 'ascii');
  buf.write(octal(Math.floor(mtime / 1000), 12), 136, 'ascii');
  buf.fill(' ', 148, 156);
  buf.write(type, 156, 1, 'ascii');
  buf.write('ustar\0', 257, 'ascii');
  buf.write('00', 263, 'ascii');
  buf.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(octal(sum, 7) + ' ', 148, 8, 'ascii');
  return buf;
}

function walk(root, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join('/');
    if (entry.isDirectory()) {
      out.push({ rel: `${rel}/`, full, dir: true });
      walk(root, full, out);
    } else if (entry.isFile()) {
      out.push({ rel, full, dir: false });
    }
  }
  return out;
}

/** Writes every file below `sourceDir` into a tar archive at `tarFile`. */
export function createTar(sourceDir, tarFile) {
  const chunks = [];
  for (const item of walk(resolve(sourceDir), resolve(sourceDir), [])) {
    const stat = statSync(item.full);
    if (item.dir) {
      chunks.push(header(item.rel, 0, '5', stat.mtimeMs));
      continue;
    }
    const data = readFileSync(item.full);
    chunks.push(header(item.rel, data.length, '0', stat.mtimeMs), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(BLOCK * 2));
  writeFileSync(tarFile, Buffer.concat(chunks));
}

/** Extracts a tar archive created by createTar() into `targetDir`. */
export function extractTar(tarFile, targetDir) {
  const root = resolve(targetDir);
  const buf = readFileSync(tarFile);
  let offset = 0;
  while (offset + BLOCK <= buf.length) {
    const block = buf.subarray(offset, offset + BLOCK);
    if (block.every((b) => b === 0)) break;
    const field = (start, length) =>
      block
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0.*$/s, '');
    const name = field(0, 100);
    const prefix = field(345, 155);
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1) || '0';
    const path = prefix ? `${prefix}/${name}` : name;
    const destination = resolve(root, path);
    if (destination !== root && !destination.startsWith(root + sep)) {
      throw new Error(`Refusing to extract outside the target directory: ${path}`);
    }
    offset += BLOCK;
    if (type === '5') {
      mkdirSync(destination, { recursive: true });
    } else if (type === '0') {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, buf.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / BLOCK) * BLOCK;
  }
}
