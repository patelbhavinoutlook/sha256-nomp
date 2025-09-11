const redis = require('redis');
const Stratum = require('stratum-pool');

// Pool configurations
const poolConfigs = {
    bitcoin: {
        daemon: {
			host: "192.168.188.2",
			port: 50010,
			user: "",
			password: ""
        }
    },
    bitcoinsilver: {
        daemon: {
            host: '192.168.188.2',
            port: 10013,
            user: '',
            password: ''
        }
    },
    mytherra: {
        daemon: {
            host: '192.168.188.2',
            port: 24013,
            user: '',
            password: ''
        }
    }
};

// Create Redis client
const client = redis.createClient();

function updateConfirmations(coin) {
    const config = poolConfigs[coin];
    if (!config) return;
    
    // Create daemon interface
    const daemon = new Stratum.daemon.interface([config.daemon], function(severity, message){
        console.log(severity + ': ' + message);
    });
    
    // Get pending pool blocks
    client.smembers(`${coin}:blocksPending`, (err, blocks) => {
        if (!err && blocks && blocks.length > 0) {
            blocks.forEach(blockData => {
                const parts = blockData.split(':');
                const blockHash = parts[0];
                const blockHeight = parseInt(parts[2]);
                
                // Get block info from daemon
                daemon.cmd('getblock', [blockHash], function(result){
                    if (!result[0].error && result[0].response) {
                        const confirmations = result[0].response.confirmations || 0;
                        client.hset(`${coin}:blocksPendingConfirms`, blockHash, confirmations);
                        console.log(`${coin} pool block ${blockHeight}: ${confirmations} confirmations`);
                        
                        // If block has enough confirmations (e.g., 101), it should be moved to confirmed
                        // This is typically handled by the payment processor
                    }
                });
            });
        }
    });
    
    // Get pending solo blocks
    client.smembers(`${coin}:blocksPending:solo`, (err, blocks) => {
        if (!err && blocks && blocks.length > 0) {
            blocks.forEach(blockData => {
                const parts = blockData.split(':');
                const blockHash = parts[0];
                const blockHeight = parseInt(parts[2]);
                
                daemon.cmd('getblock', [blockHash], function(result){
                    if (!result[0].error && result[0].response) {
                        const confirmations = result[0].response.confirmations || 0;
                        client.hset(`${coin}:blocksPendingConfirms`, blockHash, confirmations);
                        console.log(`${coin} SOLO block ${blockHeight}: ${confirmations} confirmations`);
                    }
                });
            });
        }
    });
}

// Process all coins
console.log('Block confirmations tracker started at', new Date());

Object.keys(poolConfigs).forEach(coin => {
    updateConfirmations(coin);
});

// Close Redis connection after updates
setTimeout(() => {
    client.quit();
    process.exit(0);
}, 10000); // Give it 10 seconds to complete all requests