import crypto from "node:crypto";

const TOKEN_BYTE_LENGTH = 32;

export const generateTokenHash = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const generateToken = () => {
  const token = crypto.randomBytes(TOKEN_BYTE_LENGTH).toString("hex");
  const hash = generateTokenHash(token);
  return { hash, token };
};
