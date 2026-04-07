import * as StellarSdk from '@stellar/stellar-sdk';

async function check() {
    const server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
    try {
        const account = await server.loadAccount('GBHXN3ZOSHYDXA7JZ3VNARFIZRE4ESNE7AOGJ5JZWZZXQKOJ5SSNW7L7');
        console.log(JSON.stringify(account.balances, null, 2));
    } catch (e) {
        console.error(e);
    }
}

check();
