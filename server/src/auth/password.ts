import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: cost, r: blockSize, p: parallelization, maxmem: MAX_MEMORY },
      (error, key) => error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, rawCost, rawBlockSize, rawParallelization, rawSalt, rawKey] =
    encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    !rawCost ||
    !rawBlockSize ||
    !rawParallelization ||
    !rawSalt ||
    !rawKey
  ) {
    return false;
  }
  const expected = Buffer.from(rawKey, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(
    password,
    Buffer.from(rawSalt, "base64url"),
    Number(rawCost),
    Number(rawBlockSize),
    Number(rawParallelization),
  );
  return timingSafeEqual(actual, expected);
}
