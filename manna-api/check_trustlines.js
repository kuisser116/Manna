import * as StellarSdk from '@stellar/stellar-sdk';
const publicKey = 'GBEDUIOGVN5NAHK2YCWEDFUJLAVIXOP3B5CWMPDX3KNB2VWOLTFWZQAR'; // kuiisser116@gmail.com
const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');

try {
    const account = await server.loadAccount(publicKey);
    console.log(JSON.stringify(account.balances, null, 2));
} catch (e) {
    console.error(e);
}
process.exit(0);
