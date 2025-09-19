var stats = require('./stats.js');

module.exports = function(logger, portalConfig, poolConfigs){

    var _this = this;

    var portalStats = this.stats = new stats(logger, portalConfig, poolConfigs);

    this.liveStatConnections = {};
    
    // Rate limiting storage
    var rateLimitStore = {};
    var RATE_LIMIT_WINDOW = 60000; // 1 minute
    var RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute
    
    // Input sanitization function
    var sanitizeInput = function(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 100);
    };
    
    // Rate limiting function
    var isRateLimited = function(ip) {
        var now = Date.now();
        var userRequests = rateLimitStore[ip] || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
        
        if (now > userRequests.resetTime) {
            userRequests = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
        } else {
            userRequests.count++;
        }
        
        rateLimitStore[ip] = userRequests;
        return userRequests.count > RATE_LIMIT_MAX_REQUESTS;
    };

    this.handleApiRequest = function(req, res, next){
        
        // Rate limiting check
        var clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
        if (isRateLimited(clientIp)) {
            res.status(429).json({ error: 'Rate limit exceeded' });
            return;
        }

        switch(req.params.method){
            case 'stats':
                res.header('Content-Type', 'application/json');
                //res.end(portalStats.statsString);
				res.end(JSON.stringify(portalStats.stats));
                return;
            case 'pool_stats':
                res.header('Content-Type', 'application/json');
                res.end(JSON.stringify(portalStats.statPoolHistory));
                return;
            case 'blocks':
            case 'getblocksstats':
                portalStats.getBlocks(function(data){
                    res.header('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));                                        
                });
                break;
			case 'payments':
				var poolBlocks = [];
				for(var pool in portalStats.stats.pools) {
					var payments = portalStats.stats.pools[pool].payments;
					// Limit to last 25 payments (most recent)
					if (payments && payments.length > 25) {
						payments = payments.slice(-25);
					}
					poolBlocks.push({
						name: pool, 
						pending: portalStats.stats.pools[pool].pending, 
						payments: payments
					});
				}
				res.header('Content-Type', 'application/json');
				res.end(JSON.stringify(poolBlocks));
				return;
			case 'worker_stats':
				res.header('Content-Type', 'application/json');
				if (req.url.indexOf("?")>0) {
					var url_parms = req.url.split("?");
					if (url_parms.length > 0) {
						var history = {};
						var workers = {};
						var address = url_parms[1] || null;
						if (address != null && address.length > 0) {
							// make sure it is just the miners address
							address = address.split(".")[0];
							// get miners balance along with worker balances
							portalStats.getBalanceByAddress(address, function(balances) {
								// get current round share total
								portalStats.getTotalSharesByAddress(address, function(shares) {								
									var totalHash = parseFloat(0.0);
									var totalShares = shares;
									var networkHash = 0;
									var isSoloMiner = false;
									
									// Check history for both regular and solo workers
									for (var h in portalStats.statHistory) {
										for(var pool in portalStats.statHistory[h].pools) {
											// Check regular workers
											for(var w in portalStats.statHistory[h].pools[pool].workers){
												if (w.startsWith(address)) {
													if (history[w] == null) {
														history[w] = [];
													}
													if (portalStats.statHistory[h].pools[pool].workers[w].hashrate) {
														history[w].push({time: portalStats.statHistory[h].time, hashrate:portalStats.statHistory[h].pools[pool].workers[w].hashrate});
													}
												}
											}
											// Check solo workers in history if they exist
											if (portalStats.statHistory[h].pools[pool].soloWorkers) {
												for(var w in portalStats.statHistory[h].pools[pool].soloWorkers){
													if (w.startsWith(address)) {
														if (history[w] == null) {
															history[w] = [];
														}
														if (portalStats.statHistory[h].pools[pool].soloWorkers[w].hashrate) {
															history[w].push({time: portalStats.statHistory[h].time, hashrate:portalStats.statHistory[h].pools[pool].soloWorkers[w].hashrate});
														}
													}
												}
											}
										}
									}
									
									// Check current stats for both regular and solo workers
									for(var pool in portalStats.stats.pools) {
										// Check regular workers
										for(var w in portalStats.stats.pools[pool].workers){
											if (w.startsWith(address)) {
												workers[w] = portalStats.stats.pools[pool].workers[w];
												for (var b in balances.balances) {
													if (w == balances.balances[b].worker) {
														workers[w].paid = balances.balances[b].paid;
														workers[w].balance = balances.balances[b].balance;
													}
												}
												workers[w].balance = (workers[w].balance || 0);
												workers[w].paid = (workers[w].paid || 0);
												totalHash += portalStats.stats.pools[pool].workers[w].hashrate;
												networkHash = portalStats.stats.pools[pool].poolStats.networkHash;
											}
										}
										
										// Check solo workers
										if (portalStats.stats.pools[pool].soloWorkers) {
											for(var w in portalStats.stats.pools[pool].soloWorkers){
												if (w.startsWith(address)) {
													isSoloMiner = true;
													workers[w] = portalStats.stats.pools[pool].soloWorkers[w];
													workers[w].isSolo = true; // Mark as solo worker
													
													// Check for solo balances
													for (var b in balances.balances) {
														if (w == balances.balances[b].worker) {
															workers[w].paid = balances.balances[b].paid;
															workers[w].balance = balances.balances[b].balance;
														}
													}
													workers[w].balance = (workers[w].balance || 0);
													workers[w].paid = (workers[w].paid || 0);
													totalHash += portalStats.stats.pools[pool].soloWorkers[w].hashrate || 0;
													networkHash = portalStats.stats.pools[pool].poolStats.networkHash;
												}
											}
										}
									}
									
									res.end(JSON.stringify({
										miner: address,
										isSoloMiner: isSoloMiner,  // Add flag to indicate if any worker is solo mining											
										totalHash: totalHash, 
										totalShares: totalShares, 
										networkHash: networkHash, 
										immature: balances.totalImmature, 
										balance: balances.totalHeld, 
										paid: balances.totalPaid, 
										workers: workers,
										history: history
									}));
								});
							});
						} else {
							res.end(JSON.stringify({result: "error"}));
						}
					} else {
						res.end(JSON.stringify({result: "error"}));
					}
				} else {
					res.end(JSON.stringify({result: "error"}));
				}
				return;
			case 'live_stats':
				res.writeHead(200, {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
					'Access-Control-Allow-Origin': '*',
					'X-Accel-Buffering': 'no'
				});
				
				// Send initial comment to establish connection
				res.write('***sha256-mining.go.ro***\n*******mining pool*******\n       live stats\n\n');
				
				var uid = Math.random().toString();
				_this.liveStatConnections[uid] = res;
				
				// Send initial stats if available
				if (portalStats.stats) {
					res.write('data: ' + JSON.stringify(portalStats.stats) + '\n\n');
				}
				
				// Only call flush if it exists
				if (typeof res.flush === 'function') {
					res.flush();
				}
				
				req.on("close", function() {
					delete _this.liveStatConnections[uid];
				});
				
				return;
						default:
							next();
					}
				};

    this.handleAdminApiRequest = function(req, res, next){
        switch(req.params.method){
            case 'pools': {
                res.end(JSON.stringify({result: poolConfigs}));
                return;
            }
            default:
                next();
        }
    };

};
