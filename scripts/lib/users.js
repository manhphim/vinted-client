const fs = require('fs').promises;
const path = require('path');
const { config } = require('./config');
const { ensureOutputDir } = require('./utils');


// Add this new function after fetchCatalogData and before processRawCatalogData
async function extractUserData(catalogId) {
  try {
    // Read raw catalog data
    const rawOutputDir = await ensureOutputDir('raw_catalogs');
    const rawDataPath = path.join(
      rawOutputDir,
      `catalog_${catalogId}_raw.json`
    );
    const rawItems = JSON.parse(await fs.readFile(rawDataPath, 'utf8'));

    console.log(`Extracting user data from catalog ${catalogId}...`);

    // Extract unique users
    const users = new Map();
    rawItems.forEach((item) => {
      if (item.user && item.user.id) {
        users.set(item.user.id, {
          id: item.user.id,
          login: item.user.login,
          profile_url: item.user.profile_url,
          feedback_reputation: item.user.feedback_reputation,
          followers: item.user.followers || 0,
          following: item.user.following || 0,
          items_count: item.user.items_count || 0,
          last_seen_on: item.user.last_seen_on,
          country_code: item.user.country_code,
          city_id: item.user.city_id,
          created_at: item.user.created_at,
        });
      }
    });

    // Convert to array and save
    const uniqueUsers = Array.from(users.values());
    const usersOutputDir = await ensureOutputDir('users');
    await fs.writeFile(
      path.join(usersOutputDir, `users_from_catalog_${catalogId}.json`),
      JSON.stringify(uniqueUsers, null, 2)
    );

    console.log(
      `Extracted ${uniqueUsers.length} unique users from catalog ${catalogId}`
    );
    return true;
  } catch (error) {
    console.error(
      `Error extracting users from catalog ${catalogId}:`,
      error.message
    );
    return false;
  }
}


// Add this new function after extractUserData
async function mergeUserData() {
  try {
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
    const usersDir = path.join(timestampDir, 'users');

    // Get all user files
    const userFiles = await fs.readdir(usersDir);
    const allUsers = new Map();

    // Read and merge all user files
    for (const file of userFiles) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(usersDir, file);
      const users = JSON.parse(await fs.readFile(filePath, 'utf8'));

      users.forEach((user) => {
        if (user.id) {
          // If user already exists, keep the most complete data
          if (allUsers.has(user.id)) {
            const existingUser = allUsers.get(user.id);
            allUsers.set(user.id, {
              ...existingUser,
              ...user,
              // Merge any arrays or objects if needed
              items_count: Math.max(
                existingUser.items_count || 0,
                user.items_count || 0
              ),
              followers: Math.max(
                existingUser.followers || 0,
                user.followers || 0
              ),
              following: Math.max(
                existingUser.following || 0,
                user.following || 0
              ),
            });
          } else {
            allUsers.set(user.id, user);
          }
        }
      });
    }

    // Convert Map to Array and save merged users
    const mergedUsers = Array.from(allUsers.values());
    const outputPath = path.join(timestampDir, 'all_users.json');

    await fs.writeFile(outputPath, JSON.stringify(mergedUsers, null, 2));

    console.log(
      `\nMerged ${mergedUsers.length} unique users into: ${outputPath}`
    );

    // Optionally, remove individual user files
    for (const file of userFiles) {
      await fs.unlink(path.join(usersDir, file));
    }
    await fs.rmdir(usersDir);

    return true;
  } catch (error) {
    console.error('Error merging user data:', error.message);
    return false;
  }
}

module.exports = {
  extractUserData,
  mergeUserData,
};