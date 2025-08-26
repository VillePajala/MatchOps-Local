// Debug script to check availablePlayers issue
// Run this in the browser console when creating a new game

console.log('=== DEBUG: availablePlayers Issue ===');

// Override console.log to capture the game creation logs
const originalLog = console.log;
const logs = [];
console.log = function(...args) {
  logs.push(args.join(' '));
  originalLog(...args);
};

// Monitor localStorage changes to see what gets saved
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  if (key === 'savedSoccerGames') {
    console.log('=== GAME SAVED ===');
    const games = JSON.parse(value);
    const gameIds = Object.keys(games);
    const latestGameId = gameIds[gameIds.length - 1];
    const latestGame = games[latestGameId];
    
    console.log(`Latest game ID: ${latestGameId}`);
    console.log(`teamId: ${latestGame.teamId || 'undefined'}`);
    console.log(`selectedPlayerIds: ${JSON.stringify(latestGame.selectedPlayerIds?.slice(0, 3))}... (${latestGame.selectedPlayerIds?.length} total)`);
    console.log(`availablePlayers: ${latestGame.availablePlayers?.length} players`);
    
    if (latestGame.availablePlayers && latestGame.availablePlayers.length > 0) {
      console.log('First few availablePlayers:');
      latestGame.availablePlayers.slice(0, 3).forEach((player, i) => {
        console.log(`  ${i + 1}. ${player.name} (ID: ${player.id})`);
      });
    }
    
    // Check if all selectedPlayerIds exist in availablePlayers
    if (latestGame.selectedPlayerIds && latestGame.availablePlayers) {
      const missingPlayers = latestGame.selectedPlayerIds.filter(id => 
        !latestGame.availablePlayers.some(player => player.id === id)
      );
      
      if (missingPlayers.length === 0) {
        console.log('✅ All selectedPlayerIds exist in availablePlayers');
      } else {
        console.log(`❌ ${missingPlayers.length} selectedPlayerIds NOT in availablePlayers:`);
        console.log(missingPlayers);
      }
    }
    
    console.log('===================');
  }
  
  return originalSetItem.call(this, key, value);
};

console.log('Debug monitoring enabled. Create a new game with a team to see the debug output.');
console.log('To disable: location.reload()');