import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id password hashing (ADR-013). */
@Injectable()
export class PasswordService {
  // Hash of a random value, verified against when a user does not exist so
  // that login timing does not reveal which emails are registered.
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    if (!passwordHash) {
      this.dummyHash ??= hash('dummy-password-for-timing');
      await verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    return verify(passwordHash, password).catch(() => false);
  }
}
