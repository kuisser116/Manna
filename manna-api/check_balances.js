import getDB from './src/database/db.js';
import { getBalance } from './src/services/stellar.service.js';

const supabase = getDB();
const { data: users, error } = await supabase.from('users').select('id, email, stellar_public_key');

if (error) {
    console.error(error);
} else {
    for (const user of users) {
        const balance = await getBalance(user.stellar_public_key);
        console.log(`${user.email}: ${balance.mxnc} MXNc (${balance.xlm} XLM)`);
    }
}
process.exit(0);
