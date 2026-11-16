import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

function persist(name, value, { overwrite = false } = {}) {
  try {
    const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
    const pattern = new RegExp(`^${name}=.*$`, "m");
    if (pattern.test(existing)) {
      if (!overwrite) return;
      fs.writeFileSync(ENV_PATH, existing.replace(pattern, `${name}=${value}`));
      return;
    }
    const sep = existing.length && !existing.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(ENV_PATH, `${existing}${sep}${name}=${value}\n`);
  } catch (error) {
    console.error(`Could not save ${name} to server/.env — set it manually or it will regenerate next start.`, error.message);
  }
}

/** Returns a stable secret from the environment, generating and persisting one on first run. */
export function ensureSecret(name, generate) {
  const current = process.env[name];
  if (current) return current;
  const value = generate();
  process.env[name] = value;
  persist(name, value);
  return value;
}

/** Explicitly sets (and persists) a secret, overwriting any previous value — for things the user sets, like a password hash. */
export function setSecret(name, value) {
  process.env[name] = value;
  persist(name, value, { overwrite: true });
}

export function getSecret(name) {
  return process.env[name] || "";
}
