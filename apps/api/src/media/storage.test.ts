import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { LocalStorageDriver, S3StorageDriver } from './storage';

async function read(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString();
}

describe('LocalStorageDriver', () => {
  it('stores, reads and deletes files', async () => {
    const driver = new LocalStorageDriver(await mkdtemp(join(tmpdir(), 'storage-')));
    await driver.put('t1/2026/01/a.txt', Buffer.from('hello'), 'text/plain');
    expect(await read(await driver.get('t1/2026/01/a.txt'))).toBe('hello');
    await expect(
      driver.put('t1/2026/01/a.txt', Buffer.from('again'), 'text/plain'),
    ).rejects.toThrow();
    await driver.delete('t1/2026/01/a.txt');
    await expect(driver.get('t1/2026/01/a.txt')).rejects.toThrow();
  });
});

describe('S3StorageDriver', () => {
  it('maps operations to S3 commands on the configured bucket', async () => {
    const send = vi
      .fn()
      .mockImplementation(async (command: unknown) =>
        command instanceof GetObjectCommand ? { Body: Readable.from(['data']) } : {},
      );
    const driver = new S3StorageDriver({ send } as never, 'my-bucket');
    await driver.put('t1/x.png', Buffer.from('png'), 'image/png');
    const put = send.mock.calls[0]![0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 't1/x.png',
      ContentType: 'image/png',
    });

    expect(await read(await driver.get('t1/x.png'))).toBe('data');
    await driver.delete('t1/x.png');
    expect(send.mock.calls[2]![0]).toBeInstanceOf(DeleteObjectCommand);
    await expect(driver.get('../x.png')).rejects.toThrow(/Invalid storage key/);
  });
});
