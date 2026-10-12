const path = require("node:path");
// Node 22 native dotenv loader: independent of the launch directory.
function loadEnvironment() {
  // Deployed secrets come from the platform, never a bundled local .env.
  if (process.env?.VERCEL) return;
  try {
    process.loadEnvFile(path.join(__dirname, ".env"));
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error("Could not load backend environment configuration.", {
        cause: error,
      });
  }
}
module.exports = { loadEnvironment };
