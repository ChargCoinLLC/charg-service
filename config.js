/**
 * @file config.js
 * @author Oleg Ferens <oleg.ferens@gmail.com>
 * @date 2019
 */

const fs = require('fs');
require('dotenv').load();

function normalizePort(val) {
  var port = parseInt(val, 10);
  if (isNaN(port)) {
    // named pipe
    return val;
  }
  if (port >= 0) {
    // port number
    return port;
  }
  return false;
}

config = 
{
	debug: process.env.DEBUG,
	runDApp: process.env.RUN_DAPP,
	initalRates: { BTC: 0.03873, USD: 159.84, LTC: 4.02 },
	server:{
		protocol: process.env.PROTOCOL || 'https',
		path: process.env.DAPP_PATH || '../charg-omega-dapp/dist',
		port: normalizePort(process.env.HTTP_PORT || '443'),
		ws_port: normalizePort(process.env.WS_PORT || '3001'),
	},
	sslOptions: {
		key: fs.readFileSync(process.env.SSL_KEY || '../ssl/privkey.pem'),
		cert: fs.readFileSync(process.env.SSL_CERT ||'../ssl/cert.pem'),
		ca: fs.readFileSync(process.env.SSL_CA ||'../ssl/chain.pem')
	},
	reserveAccount: {
		addr: process.env.RESERVE_ADDR,
		pk: process.env.RESERVE_PK
	},
	exchangeAccounts: {
		BTC: process.env.BTC_RESERVE_ADDR,
		LTC: process.env.LTC_RESERVE_ADDR
	},	
	bitcoinOptions: {
		host: process.env.BTC_HOST,
		network: process.env.BTC_NETWORK,
		port: process.env.BTC_PORT,
		username: process.env.BTC_USERNAME,
		password: process.env.BTC_PASSWORD
	},
	litecoinOptions: {
		host: process.env.LTC_HOST,
		network: process.env.LTC_NETWORK,
		port: process.env.LTC_PORT,
		username: process.env.LTC_USERNAME,
		password: process.env.LTC_PASSWORD
	},
	braintreeOptions: {
		environment: process.env.BT_ENVIRONMENT.charAt(0).toUpperCase() + process.env.BT_ENVIRONMENT.slice(1),
		merchantId: process.env.BT_MERCHANT_ID,
		publicKey: process.env.BT_PUBLIC_KEY,
		privateKey: process.env.BT_PRIVATE_KEY
	},
	fees: {
		BTC: process.env.FEE_BTC || 2,
		LTC: process.env.FEE_LTC || 2,
		USD: process.env.FEE_USD || 4
	},
	sellOrderEvent: process.env.SELL_ORDER_EVENT,
	buyOrderEvent: process.env.BUY_ORDER_EVENT,
	sellEvent: process.env.SELL_EVENT,
	buyEvent: process.env.BUY_EVENT,
	cancelSellEvent: process.env.CANCEL_SELL_EVENT,
	cancelBuyEvent: process.env.CANCEL_BUY_EVENT,
	chargeOnEvent: process.env.CHARGE_ON_EVENT,
	gasLimit: process.env.GAS_LIMIT,
	gasPrice: process.env.GAS_PRICE,
	chargeContractAddress: process.env.CHARG_CONTRACT,
	ratesUrl: process.env.RATES_URL,
	exchangeContractAddress: process.env.EXCHANGE_CONTRACT,
	web3WsProvider: process.env.WEB3_WS_PROVIDER,
	geoLocationUrl: process.env.GEO_LOCATION_URL,
	socketDeltaUrl: process.env.FD_WS_URL
}

module.exports = config;
