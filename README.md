# Charg Service 
The Charg.io Backend Service

WebSocket events:

	newBlockNumber - new block mined
	newExchange - new Charge exchange event
	currentRates - current rates to ether
	
WebSocket requests:
	
	getBlockNumber - get current block number
	getMarket - get ForkDelta market data
	getPastEvents - get all Charge exchange events
	getFees - get exchange fees
	
	getBitcoinAddress - get addterss for BTC payment
	checkBitcoinPayment - check BTC payment
	
	getLitecoinAddress - get addterss for LTC payment
	checkLitecoinPayment - check LTC payment
	
	getBraintreeToken - get token for credit card payment
	payBraintree - start credit card transaction
	
	getLocation - get client location by IP address
  
