const path = require('path');
const fs = require('fs').promises;
const { config } = require('./lib/config');
const { catalogIds } = require('./lib/config');
const { fetchCatalogData } = require('./lib/catalog');
const { extractUserData, mergeUserData } = require('./lib/users');
const {
  fetchWardrobeData,
  mergeWardrobeData,
  fetchUserItemFacets,
} = require('./lib/wardrobe');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Add retry limit constant
const MAX_RETRIES = 5;
// Use CPU cores for parallelization (leave 1 core free for system)
const MAX_WORKERS = Math.max(1, os.cpus().length - 1);


// Worker thread implementation
if (!isMainThread) {
  const { userId, searchParams } = workerData;
  
  async function processUser() {
    try {
      const itemFacets = await fetchUserItemFacets(userId);
      const success = await fetchWardrobeData(itemFacets, searchParams, userId);
      
      if (success) {
        return { success: true, userId };
      } else {
        return { success: false, userId };
      }
    } catch (error) {
      return { success: false, userId, error: error.message };
    }
  }
  
  processUser().then(result => parentPort.postMessage(result));
  
} else {
  // Main thread code
  async function main() {
    const searchParams = process.argv[2] ? JSON.parse(process.argv[2]) : {};
    let failedToFetch = [];
    let retryCount = 0;
  
    // Get the current date timestamp
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateTimestamp = `${day}-${month}`;
  
    // Path to the all_users.json file
    const allUsersPath = path.join(
      __dirname,
      '..',
      config.outputDir,
      'all_users.json'
    );
  
    // Check if all_users.json exists for today
    let allUsersExists = false;
    try {
      await fs.access(allUsersPath);
      allUsersExists = true;
      console.log(
        'Found existing all_users.json for today, skipping initial phases...'
      );
    } catch (error) {
      console.log('No existing all_users.json found, starting from Phase 1...');
    }
  
    if (!allUsersExists) {
      // Phase 1: Fetch all catalog data
      console.log('Phase 1: Fetching catalog data...');
      for (const catalogId of catalogIds) {
        console.log(`\nFetching catalog ID: ${catalogId}`);
        const success = await fetchCatalogData(catalogId, searchParams);
        if (success) {
          console.log(`Processing catalog ID: ${catalogId}`);
        } else {
          failedToFetch.push(catalogId);
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
  
      // Retry failed fetches with limit
      while (failedToFetch.length > 0 && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`\nRetry attempt ${retryCount} of ${MAX_RETRIES}`);
        console.log(`Retrying failed catalogs: ${failedToFetch.join(', ')}`);
  
        for (const catalogId of [...failedToFetch]) {
          console.log(`\nFetching catalog ID: ${catalogId}`);
          const success = await fetchCatalogData(catalogId, searchParams);
          if (success) {
            failedToFetch = failedToFetch.filter((id) => id !== catalogId);
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
  
      if (retryCount >= MAX_RETRIES && failedToFetch.length > 0) {
        throw new Error(
          `Maximum retry attempts (${MAX_RETRIES}) reached. Failed items: ${failedToFetch.join(
            ', '
          )}`
        );
      }
  
      // Reset retry count for next phase
      retryCount = 0;
      failedToFetch = [];
  
      // Phase 2: Extract user data
      console.log('\nPhase 2: Extracting user data...');
      for (const catalogId of catalogIds) {
        console.log(`\nExtracting users from catalog ID: ${catalogId}`);
        await extractUserData(catalogId);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
  
      // Phase 3: Merge user data
      console.log('\nPhase 3: Merging user data...');
      await mergeUserData();
    }
  
    // Phase 4: Fetch wardrobe data for all users
    console.log('\nPhase 4: Fetching wardrobe data for all users...');
  
    try {
      // Read the all_users.json file
      const allUsersData = await fs.readFile(allUsersPath, 'utf8');
      const allUsers = JSON.parse(allUsersData);
  
      console.log(`Found ${allUsers.length} users to fetch wardrobe data for.`);
  
      // Limit the number of users to process to avoid rate limiting
      const userLimit = 9999; // Adjust this number as needed
      const usersToProcess = allUsers.slice(0, userLimit);
  
      console.log(
        `Processing ${usersToProcess.length} users (limited to ${userLimit}) using ${MAX_WORKERS} parallel workers.`
      );
  
      // Process users in parallel
      const { processedCount, failedUsers } = await processUsersInParallel(usersToProcess, searchParams);
      
      console.log(`Processed ${processedCount} users successfully.`);
      
      // Retry failed users
      if (failedUsers.length > 0) {
        console.log(`\nRetrying ${failedUsers.length} failed users...`);
        retryCount = 0;
        
        while (failedUsers.length > 0 && retryCount < MAX_RETRIES) {
          retryCount++;
          console.log(`\nRetry attempt ${retryCount} of ${MAX_RETRIES}`);
          
          const usersToRetry = failedUsers.map(id => ({ id }));
          const { processedCount: retryProcessedCount, failedUsers: newFailedUsers } = 
            await processUsersInParallel(usersToRetry, searchParams);
          
          console.log(`Retry processed ${retryProcessedCount} users successfully.`);
          failedUsers = newFailedUsers;
        }
        
        if (failedUsers.length > 0) {
          console.log(`\nUnable to process ${failedUsers.length} users after ${MAX_RETRIES} retry attempts.`);
        }
      }
    } catch (error) {
      console.error('Error fetching wardrobe data:', error.message);
      throw error;
    }

    console.log('\nFinal Phase: Merging all data...');
    await mergeUserData();
    await mergeWardrobeData();

    console.log('\nAll processing completed!');
  }

  // Execute the script
  main().catch(console.error);
}

// Process users in parallel batches
async function processUsersInParallel(users, searchParams) {
  let processedCount = 0;
  let failedUsers = [];
  
  // Process users in batches
  for (let i = 0; i < users.length; i += MAX_WORKERS) {
    const batch = users.slice(i, i + MAX_WORKERS);
    console.log(`Processing batch ${Math.floor(i/MAX_WORKERS) + 1}/${Math.ceil(users.length/MAX_WORKERS)}, users ${i+1}-${Math.min(i+MAX_WORKERS, users.length)}`);
    
    const workerPromises = batch.map(user => {
      return new Promise((resolve) => {
        if (!user.id) {
          resolve({ success: false, userId: null });
          return;
        }
        
        const worker = new Worker(__filename, {
          workerData: { userId: user.id, searchParams }
        });
        
        worker.on('message', result => {
          if (result.success) {
            processedCount++;
            console.log(`Completed user ${result.userId} (${processedCount}/${users.length})`);
          } else {
            failedUsers.push(result.userId);
            console.log(`Failed user ${result.userId}: ${result.error || 'Unknown error'}`);
          }
          resolve(result);
        });
        
        worker.on('error', error => {
          failedUsers.push(user.id);
          resolve({ success: false, userId: user.id });
        });
        
        worker.on('exit', code => {
          if (code !== 0) {
            failedUsers.push(user.id);
            resolve({ success: false, userId: user.id });
          }
        });
      });
    });
    
    await Promise.all(workerPromises);
    
    // Add a small delay between batches to prevent overwhelming the system
    if (i + MAX_WORKERS < users.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return { processedCount, failedUsers };
}
