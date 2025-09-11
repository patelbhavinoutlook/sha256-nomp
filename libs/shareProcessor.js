var redis = require('redis');

/*
This module deals with handling shares when in internal payment processing mode. It connects to a redis
database and inserts shares with the database structure of:

key: coin_name + ':' + block_height
value: a hash with..
        key:
 */

module.exports = function(logger, poolConfig){

    var redisConfig = poolConfig.redis;
    var coin = poolConfig.coin.name;

    var forkId = process.env.forkId;
    var logSystem = 'Pool';
    var logComponent = coin;
    var logSubCat = 'Thread ' + (parseInt(forkId) + 1);
    
    var connection = redis.createClient(redisConfig.port, redisConfig.host);
    if (redisConfig.password) {
        connection.auth(redisConfig.password);
    }
    connection.on('ready', function(){
        logger.debug(logSystem, logComponent, logSubCat, 'Share processing setup with redis (' + redisConfig.host +
            ':' + redisConfig.port  + ')');
    });
    connection.on('error', function(err){
        logger.error(logSystem, logComponent, logSubCat, 'Redis client had an error: ' + JSON.stringify(err))
    });
    connection.on('end', function(){
        logger.error(logSystem, logComponent, logSubCat, 'Connection to redis database has been ended');
    });
    connection.info(function(error, response){
        if (error){
            logger.error(logSystem, logComponent, logSubCat, 'Redis version check failed');
            return;
        }
        var parts = response.split('\r\n');
        var version;
        var versionString;
        for (var i = 0; i < parts.length; i++){
            if (parts[i].indexOf(':') !== -1){
                var valParts = parts[i].split(':');
                if (valParts[0] === 'redis_version'){
                    versionString = valParts[1];
                    version = parseFloat(versionString);
                    break;
                }
            }
        }
        if (!version){
            logger.error(logSystem, logComponent, logSubCat, 'Could not detect redis version - but be super old or broken');
        }
        else if (version < 2.6){
            logger.error(logSystem, logComponent, logSubCat, "You're using redis version " + versionString + " the minimum required version is 2.6. Follow the damn usage instructions...");
        }
    });

    this.handleShare = function(isValidShare, isValidBlock, shareData) {
        
        var redisCommands = [];
        var dateNow = Date.now();
        
        // Get solo flag from shareData (set by poolWorker)
        var isSoloMining = shareData.isSoloMining || false;
        
        // CRITICAL FIX: Add worker tracking
        var workerAddress = shareData.worker;
        var workerAddressParts = workerAddress.split('.');
        var minerAddress = workerAddressParts[0];
        var workerName = workerAddressParts[1] || 'default';
        
        if (isValidShare) {
            if (isSoloMining) {
                // SOLO MINING - store in solo keys
                redisCommands.push(['hincrbyfloat', coin + ':shares:roundCurrent:solo', shareData.worker, shareData.difficulty]);
                redisCommands.push(['hincrby', coin + ':stats:solo', 'validShares', 1]);
                
                // WORKER TRACKING FOR SOLO
                redisCommands.push(['hincrbyfloat', coin + ':workers:solo:' + workerAddress, 'shares', shareData.difficulty]);
                redisCommands.push(['hset', coin + ':workers:solo:' + workerAddress, 'lastShare', dateNow]);
                redisCommands.push(['hincrby', coin + ':workers:solo:' + workerAddress, 'validShares', 1]);
                
                // Solo hashrate
                var hashrateData = [shareData.difficulty, shareData.worker, dateNow];
                redisCommands.push(['zadd', coin + ':hashrate:solo', dateNow / 1000 | 0, hashrateData.join(':')]);
                
            } else {
                // POOL MINING - store in regular keys
                redisCommands.push(['hincrbyfloat', coin + ':shares:roundCurrent', shareData.worker, shareData.difficulty]);
                redisCommands.push(['hincrby', coin + ':stats', 'validShares', 1]);
                
                // CRITICAL FIX: WORKER TRACKING FOR POOL
                redisCommands.push(['hincrbyfloat', coin + ':workers:' + workerAddress, 'shares', shareData.difficulty]);
                redisCommands.push(['hset', coin + ':workers:' + workerAddress, 'lastShare', dateNow]);
                redisCommands.push(['hincrby', coin + ':workers:' + workerAddress, 'validShares', 1]);
                
                // Pool hashrate
                var hashrateData = [shareData.difficulty, shareData.worker, dateNow];
                redisCommands.push(['zadd', coin + ':hashrate', dateNow / 1000 | 0, hashrateData.join(':')]);
            }
            
            // Track active miners
            redisCommands.push(['sadd', coin + ':activeMiners', minerAddress]);
            redisCommands.push(['setex', coin + ':worker:' + workerAddress, 3600, dateNow]);
            
        } else {
            // Invalid shares
            redisCommands.push(['hincrby', coin + ':stats', 'invalidShares', 1]);
            
            // Track invalid shares for worker
            if (isSoloMining) {
                redisCommands.push(['hincrby', coin + ':stats:solo', 'invalidShares', 1]);
                redisCommands.push(['hincrby', coin + ':workers:solo:' + workerAddress, 'invalidShares', 1]);
                var hashrateData = [-shareData.difficulty, shareData.worker, dateNow];
                redisCommands.push(['zadd', coin + ':hashrate:solo', dateNow / 1000 | 0, hashrateData.join(':')]);
            } else {
                redisCommands.push(['hincrby', coin + ':workers:' + workerAddress, 'invalidShares', 1]);
                var hashrateData = [-shareData.difficulty, shareData.worker, dateNow];
                redisCommands.push(['zadd', coin + ':hashrate', dateNow / 1000 | 0, hashrateData.join(':')]);
            }
        }

        if (isValidBlock) {
            if (isSoloMining) {
				// SOLO BLOCK
				logger.special(logSystem, logComponent, logSubCat, 
					'[SOLO BLOCK] Found by ' + shareData.worker + ' at height ' + shareData.height);
				
				redisCommands.push(['sadd', coin + ':blocksPending:solo', 
					[shareData.blockHash, shareData.txHash || shareData.blockHash, 
					 shareData.height, shareData.worker, dateNow].join(':')]);
				
				// CRITICAL FIX: Store solo shares with the block height AND in a solo-specific key
				redisCommands.push(['hset', coin + ':shares:round' + shareData.height + ':solo', 
					shareData.worker, '1']);
				
				// Also store times for compatibility
				redisCommands.push(['hset', coin + ':shares:times' + shareData.height, 
					shareData.worker.split('.')[0], '1']);
				
				// Clear solo shares for new round
				redisCommands.push(['del', coin + ':shares:roundCurrent:solo']);
				redisCommands.push(['hincrby', coin + ':stats:solo', 'validBlocks', 1]);
				
				// Track blocks found by worker
				redisCommands.push(['hincrby', coin + ':workers:solo:' + workerAddress, 'blocks', 1]);        
            } else {
                // POOL BLOCK
                redisCommands.push(['rename', coin + ':shares:roundCurrent', coin + ':shares:round' + shareData.height]);
                redisCommands.push(['rename', coin + ':shares:timesCurrent', coin + ':shares:times' + shareData.height]);
                redisCommands.push(['sadd', coin + ':blocksPending', 
                    [shareData.blockHash, shareData.txHash || shareData.blockHash, 
                     shareData.height, shareData.worker, dateNow].join(':')]);
                
                // Track blocks found by worker
                redisCommands.push(['hincrby', coin + ':workers:' + workerAddress, 'blocks', 1]);
            }
            
            redisCommands.push(['hincrby', coin + ':stats', 'validBlocks', 1]);
        }

        // ALWAYS execute Redis commands
        connection.multi(redisCommands).exec(function(err, replies){
            if (err)
                logger.error(logSystem, logComponent, logSubCat, 
                    'Error with share processor multi ' + JSON.stringify(err));
        });
    };

};