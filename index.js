/**
 * @file index.js
 * @author Oleg Ferens <oleg.ferens@gmail.com>
 * @date 2019
 */
 
const config = require('./config');
const http = require(config.server.protocol);
const Static = require('node-static');

const socketServer = require(config.server.protocol).Server(config.sslOptions);
const ioServer = require('socket.io')(socketServer);

const chargeAbi = require('./abi/charge.json');
const exchangeAbi = require('./abi/exchange.json');

const Web3 = require('web3');
const web3 = new Web3( new Web3.providers.WebsocketProvider(config.web3WsProvider));
const Tx = require('ethereumjs-tx');

const BitcoinCore = require('bitcoin-core');
const bitcoinCore = new BitcoinCore(config.bitcoinOptions);
const litecoinCore = new BitcoinCore(config.litecoinOptions);

var braintree = require('braintree');
config.braintreeOptions.environment = braintree.Environment[config.braintreeOptions.environment];
var braintreeGateway = braintree.connect(config.braintreeOptions);

const BigNumber = require('bn.js');

var TRANSACTION_SUCCESS_STATUSES = [
  braintree.Transaction.Status.Authorizing,
  braintree.Transaction.Status.Authorized,
  braintree.Transaction.Status.Settled,
  braintree.Transaction.Status.Settling,
  braintree.Transaction.Status.SettlementConfirmed,
  braintree.Transaction.Status.SettlementPending,
  braintree.Transaction.Status.SubmittedForSettlement
];

// web3 1.0.0-beta.35
const chargeContract = new web3.eth.Contract(chargeAbi, config.chargeContractAddress);
const exchangeContract = new web3.eth.Contract(exchangeAbi, config.exchangeContractAddress);

var txNonce = Number(Math.random().toString().slice(2));
web3.eth.getTransactionCount( config.reserveAccount.addr, (e, r) => {
	txNonce = r;
});

var debugMessage = function(err, data) {
	if (config.debug) {
		console.log(err, data);
	}
}

var sellOrders = [];
var buyOrders = [];

var currentBlockNumber = 0;
var currentRates = config.initalRates; // inital eth rates, will be updated

web3.eth.subscribe('newBlockHeaders', (e,r) => {
	if (typeof r.number != 'undefined') {
		if (currentBlockNumber==0) {
			currentBlockNumber=r.number;
			exchangeContract.getPastEvents({ 
				fromBlock: 0, 
				toBlock: 'latest' 
			}, (errors, events) => {
				if (!errors) {
					events.forEach(function(event){
						updateOrders(event.raw);
					});

					exchangeContract.events.allEvents({
						fromBlock: 'latest', 
						toBlock: 'latest'
					}, (errors, events) => {
						if (!errors)	{
							ioServer.emit('newExchange', events.raw);
							updateOrders(events.raw);
						}
					});
				}
			});
		}
		ioServer.emit('newBlockNumber', currentBlockNumber=r.number)
	}
});

var updateOrders = function(res) {

	var rate;
	
	var event = res.topics[0];
	var hash = res.topics[1];
	var sender;
	
	if (event==config.sellOrderEvent || event==config.buyOrderEvent) {
	
		var give = web3.utils.fromWei(res.data.substr(2+0, 64), "ether");
		var get = web3.utils.fromWei(res.data.substr(2+64, 64), "ether");
	
		var expire = parseInt(res.data.substr(2+128, 64),16) - currentBlockNumber;
		sender = "0x" + res.data.substr(2+192+24, 40);

		if (expire<5 || give==0 || get==0) {  // block mined about 10 sec 
			return;
		}

		if (event==config.sellOrderEvent) {

			rate = (get/give).toFixed(7);

			sellOrders[hash] = {
				give: give,
				get: get,
				rate: rate,
				expire: expire,
				hash: hash,
				seller: sender
			};
			
		}else if (event==config.buyOrderEvent) {
			
			rate = (give/get).toFixed(7);

				buyOrders[hash] = {
				give: give,
				get: get,
				rate: rate,
				expire: expire
			};
		}
		//checkSenderBalance(sender,hash);
		//console.log(currentAccount, sender);

	} else if (event==config.sellEvent) {

		var give = web3.utils.fromWei(res.data.substr(2+0, 64), "ether");
		var get = web3.utils.fromWei(res.data.substr(2+64, 64), "ether");

		//checkSenderBalance(sender,hash);

		if (hash in buyOrders) {
			if (give==0 || get==0) {
				delete buyOrders[hash];
			}else{	
				buyOrders[hash].give = give;
				buyOrders[hash].get = get;
				buyOrders[hash].rate = (give/get).toFixed(7);  //should not be changed, but ...
			};
		}

	} else if (event==config.buyEvent) {
	
		var give = web3.utils.fromWei(res.data.substr(2+0, 64), "ether");
		var get = web3.utils.fromWei(res.data.substr(2+64, 64), "ether");
		
		if (hash in sellOrders) {
			if (give==0 || get==0) {
				delete sellOrders[hash];
			}else{	
				sellOrders[hash].give = give;
				sellOrders[hash].get = get;
				sellOrders[hash].rate = (get/give).toFixed(7);  //should not be changed, but ...
				//checkSenderBalance(hash);
			};
		}

	} else if (event==config.cancelSellEvent) {

		if (hash in sellOrders) {
			delete sellOrders[hash];
		}
	
	} else if (event==config.cancelBuyEvent) {

		if (hash in buyOrders) {
			delete buyOrders[hash];
		}

	} else if (event==config.chargeOnEvent) {
	
		//checkSenderBalance(sender);
		
		var give = web3.utils.fromWei(res.data.substr(2+0, 64), "ether");
		var get = web3.utils.fromWei(res.data.substr(2+64, 64), "ether");
		
		if (hash in sellOrders) {
			sellOrders[hash].give = sellOrders[hash].give - get;
			sellOrders[hash].get = sellOrders[hash].get - give;
			//sellOrders[hash].rate = (get/give).toFixed(7);  //should not be changed, but ...
		}
	}
/*
	if (Object.keys(sellOrders).length>0) {
		var tmpOrders = [];
		for ( var hash in sellOrders ){
			tmpOrders.push( sellOrders[ hash ] );
		}
		console.log(tmpOrders.reduce((prev, current) => (prev.rate < current.rate) ? prev : current));
	
		var bestExchangeAsk = Math.min.apply(Math, tmpOrders.map( o => o.rate ));
		console.log('a',bestExchangeAsk);

	}

	if (Object.keys(buyOrders).length>0) {
		var tmpOrders = [];
		for ( var hash in buyOrders ){
			tmpOrders.push( buyOrders[ hash ] );
		}
		console.log(tmpOrders.reduce((prev, current) => (prev.rate > current.rate) ? prev : current));

		var bestExchangeBid = Math.max.apply(Math, tmpOrders.map( o => o.rate ));
		console.log('b',bestExchangeBid);
	}
*/

};



ioServer.on('connection', function(socket) {
	
	var clientIpAddress = socket.handshake.address;
	var date = new Date();
	debugMessage("", "New connection "+socket.handshake.address+" "+date.toString());

	/*
		send current block number to client
	*/
	socket.on('getBlockNumber', function(respToClient){
		respToClient(currentBlockNumber);
	});
	
	/*
		emit ForkDelta getMarket request
	*/
	socket.on('getMarket', function(data, respToClient){
		socketDelta.emit('getMarket', { token: config.chargeContractAddress, user: config.reserveAccount.addr });
	});


	/*
		get all exchange events
	*/
	socket.on('getPastEvents', function(respToClient){
		exchangeContract.getPastEvents(
			{ fromBlock: 0, toBlock: "latest" },
			(errors, events) => {
				if (!errors) {
					respToClient(events);
				}
			}
		);
	});

	/*
		get best order hash
	*/
	socket.on('getOrderHash', function(chargData, respToClient){
		
		
	});

	/*
		get exchange fees
	*/
	socket.on('getFees', function(respToClient){
		respToClient(config.fees);
	});
	
	/*
		send location by IP address
	*/
	socket.on('getLocation', function(respToClient){
		http.get(config.geoLocationUrl+clientIpAddress, (resp) => {
			var data = '';
			resp.on('data', (chunk) => {
				data += chunk;
			});
			resp.on('end', () => {
			  try {
				var result = JSON.parse(data);
				respToClient(result);
			  } catch (e) {
				debugMessage(e);
			  }
			});
		}).on("error", (err) => {
			debugMessage(err);
		});
	});

	/*
		send new BTC address for payment
	*/
	socket.on('getBitcoinAddress', function(respToClient){
		//bitcoinCore.getNewAddress().then(respToClient);
		const batch = [{ method: 'getnewaddress', params: [] }];
		bitcoinCore.command(batch).then(([address, error]) =>  {console.log(address);respToClient(address)});
	});

	/*
		check BTC payment
	*/
	socket.on('checkBitcoinPayment', function(paymentData, respToClient){
		debugMessage("",paymentData);
        var checkBitcoinTimer = setInterval(function(){
			bitcoinCore.getReceivedByAddress(paymentData.addressBTC).then(function(balance){
				debugMessage("",balance);
				if (balance >= paymentData.amountBTC) {
					clearInterval(checkBitcoinTimer);
					//var amountEth = new BigNumber(paymentData.amountBTC).dividedBy(currentRates.BTC*100).dividedBy(100+config.fees.BTC);
					var amountEth = balance / currentRates.BTC * 100 / (100+config.fees.BTC);
					paymentData.amountWei = web3.utils.toWei(amountEth.toString(), "ether");
					doCharge(paymentData, respToClient);
					bitcoinCore.sendToAddress(config.exchangeAccounts.LTC, balance, paymentData.hash, paymentData.station);
				};
			});
		}, 10000);  // check every 10 sec
	});

	/*
		send new LTC address for payment
	*/
	socket.on('getLitecoinAddress', function(respToClient){
		//litecoinCore.getNewAddress().then(respToClient);
		const batch = [{ method: 'getnewaddress', params: [] }];
		litecoinCore.command(batch).then(([address, error]) => {console.log(address);respToClient(address)});
	});

	/*
		check LTC payment
	*/
	socket.on('checkLitecoinPayment', function(paymentData, respToClient){
		debugMessage("",paymentData);
        var checkLitecoinTimer = setInterval(function(){
			litecoinCore.getReceivedByAddress(paymentData.addressLTC).then(function(balance){
				debugMessage("",balance);
				if (balance >= paymentData.amountLTC) {
					clearInterval(checkLitecoinTimer);
					//var amountEth = new BigNumber(paymentData.amountLTC).dividedBy(currentRates.LTC*100).dividedBy(100+config.fees.BTC);
					var amountEth = balance / currentRates.LTC * 100 / (100+config.fees.LTC);
					paymentData.amountWei = web3.utils.toWei(amountEth.toString(), "ether");
					doCharge(paymentData, respToClient);
					litecoinCore.sendToAddress(config.exchangeAccounts.LTC, balance, paymentData.hash, paymentData.station);
				};
			});
		}, 10000);  // check every 10 sec
	});

	/*
		get token for credit card payment
	*/
	socket.on('getBraintreeToken', function(respToClient){
		braintreeGateway.clientToken.generate({}, function (err, response) {
			debugMessage(err, response);
			if (!err) respToClient(response);
		});
	});
	
	/*
		proceed creditcard payment
	*/
	socket.on('payBraintree', function(paymentData, respToClient){

		debugMessage("",paymentData);
		
		// check balances first
		Promise.all([
			web3.eth.getBalance(config.reserveAccount.addr),
			chargeContract.methods.balanceOf(config.reserveAccount.addr).call(),
			exchangeContract.methods.ethBalance(config.reserveAccount.addr).call(),
			exchangeContract.methods.coinBalance(config.reserveAccount.addr).call(),
			exchangeContract.methods.ethBalance(paymentData.seller).call(),
			exchangeContract.methods.coinBalance(paymentData.seller).call()
		]).then((results) => {
			const [accEthBalance, accChgBalance, exchEthBalance, exchChgBalance, sellerEthBalance, sellerChgBalance] = results;
			// check if CHG seller has enough tokens
			debugMessage("",results);

			// pay USD via gateway
			braintreeGateway.transaction.sale({
				amount: paymentData.amountUsd.toFixed(2),
				paymentMethodNonce: paymentData.nonce,
				options: {
				  submitForSettlement: true
				  //orderId: data.key
				}
				//customerId: data.key
					//options: {
					//submitForSettlement: false,
					//storeInVaultOnSuccess: true,
					//orderId: data.key
				//}
			}, function (err, result) {
				debugMessage(err, result);
				if (result && result.success && result.transaction) {
					braintreeGateway.transaction.find(result.transaction.id, function (err, transaction) {
					  if (TRANSACTION_SUCCESS_STATUSES.indexOf(transaction.status) !== -1) {
							var amountEth = paymentData.amountUsd / currentRates.USD * 100 / (100+config.fees.USD);
							//var amountEth = new BigNumber(paymentData.amountUsd).div(currentRates.USD*100).div(100+config.fees.USD);
							paymentData.amountWei = web3.utils.toWei(amountEth.toString(), "ether");
							doCharge(paymentData, respToClient);
						}else{
							respToClient({err:'Card payment failed', transaction: transaction});
						}
					});
				} else {
					//transactionErrors = result.errors.deepErrors();
					//resp({err: true, result: result, msg: formatErrors(transactionErrors)});
					respToClient({err: err, result: result});
				}
			}); // braintree payment
			
			
		});	//check balances
		
	}); // socket payBraintree
	
});


/*
	get order hash 
*/
var getBestOrder = function(amountWei) {
	if (Object.keys(sellOrders).length>0) {
		var tmpOrders = [];
		for ( var hash in sellOrders ){
			tmpOrders.push( sellOrders[ hash ] );
		}
		console.log(tmpOrders);
		return (tmpOrders.reduce((prev, current) => (prev.rate < current.rate) ? prev : current));
		var bestExchangeAsk = Math.min.apply(Math, tmpOrders.map( o => o.rate ));
		console.log(bestExchangeAsk);
	}
	return undefined;
};


/*
	run smart contract chargOn function
*/
var doCharge = function(paymentData, respToClient) {
	
	if ((typeof paymentData.hash == 'undefined')||(paymentData.hash=='')) {
		var bestOrder = getBestOrder(paymentData.amountWei);
		console.log(bestOrder);
		paymentData.hash = bestOrder.hash;
		console.log(paymentData.hash);
	}
	
	debugMessage(paymentData);
	
	const privateKey = new Buffer(config.reserveAccount.pk, 'hex');

	var txData = web3.eth.abi.encodeFunctionCall({
		name: 'chargOn',
		type: 'function',
		inputs: [{
			type: 'address',
			name: 'station'
		},{
			type: 'bytes32',
			name: 'hash'
		}]
	}, [paymentData.station, paymentData.hash]);		

	debugMessage("", txData);
	
	//var txData1 = web3.utils.sha3("chargOn(address,bytes32)").substr(0,10);
	//debugMessage(txData1);

	var txOptions = {
		//chainId: 4,
		nonce: txNonce++,
		gasPrice: web3.utils.toHex(config.gasPrice),
		gasLimit: web3.utils.toHex(config.gasLimit),
		from: config.reserveAccount.addr,
		to: config.exchangeContractAddress,
		value: (1*paymentData.amountWei),
		data: txData
	}
	
	const tx = new Tx(txOptions);
	tx.sign(privateKey);
	const rawTx = `0x${tx.serialize().toString('hex')}`;

	web3.eth.sendSignedTransaction(rawTx)
	.on('transactionHash', function (hash) {
		debugMessage("", hash)
		//respToClient({status:'created', receipt:hash});
	})
	.on('receipt', function (receipt) {
		debugMessage("", receipt)
		respToClient({status:'pending', receipt:receipt});
		//return receipt;
	})
	.on('confirmation', function (confirmationNumber, receipt) {
		if (confirmationNumber==1) {
			debugMessage("", confirmationNumber, receipt);
			respToClient({status:'confirmed', receipt:receipt});
		 }
	})
	.on('error', (e) => {
		debugMessage(e)
	});	

}

/*
	ForkDelta events (alternative exchange)
*/
const ioDelta = require('socket.io-client');
const socketDelta = ioDelta.connect(config.socketDeltaUrl, { transports: ['websocket'] });
//socketDelta.on('orders', (data) => { ioServer.emit('forkdeltaOrders', data) });
//socketDelta.on('trades', (data) => { ioServer.emit('forkdeltaTrades', data) });
//socketDelta.on('funds', (data) => {	ioServer.emit('forkdeltaFunds', data) });
socketDelta.on('market', (data) => { ioServer.emit('forkdeltaMarket', data.returnTicker.ETH_0xc4a8656) });//CHG
socketDelta.on('message', (data) => { ioServer.emit('forkdeltaMessage', data) });
socketDelta.on('messageResult', (data) => { ioServer.emit('forkdeltaResult', data) });

/*
	update exchange rates
*/
var updateRates = function() {
	http.get(config.ratesUrl, (resp) => {
		var data = '';
		resp.on('data', (chunk) => {
			data += chunk;
		});
		resp.on('end', () => {
			
			  try {
				var result = JSON.parse(data);
				currentRates = result;
				ioServer.emit('currentRates', result)		
			  } catch (e) {
				debugMessage(e);
			  }

		});
	}).on("error", (err) => {
		debugMessage("Error: " + err.message);
	});
};
updateRates();
var rateInterval = setInterval(updateRates, 10000);

/*
	run static http server
*/
if (config.runDApp){
	const fileServer = new Static.Server(config.server.path);
	http.createServer(config.sslOptions, function (req, res) {
	  
	  fileServer.serve(req, res);

	}).listen(config.server.port);
	debugMessage("","Static Web Server started on port "+config.server.port);
}

/*
	run websocket server
*/
socketServer.listen(config.server.ws_port);	
debugMessage("","Web Socket Server started on port "+config.server.ws_port);
