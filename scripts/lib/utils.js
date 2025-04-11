const fs = require('fs').promises;
const path = require('path');
const { config } = require('./config');  // Destructure to get the config object

async function ensureOutputDir(dirName) {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateTimestamp = `${day}-${month}`;

  const timestampDir = path.join(
    __dirname,
    '..',
    '..',
    config.outputDir,
    dateTimestamp
  );
  const outputPath = path.join(timestampDir, dirName);

  try {
    await fs.access(timestampDir);
  } catch {
    await fs.mkdir(timestampDir, { recursive: true });
  }

  try {
    await fs.access(outputPath);
  } catch {
    await fs.mkdir(outputPath, { recursive: true });
  }

  return outputPath;
}

module.exports = {
  ensureOutputDir,
};
