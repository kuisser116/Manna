import getDB from './src/database/db.js';
const supabase = getDB();
const { data: users, error } = await supabase.from('users').select('id, email, stellar_public_key');
if (error) {
    console.error(error);
} else {
    console.log(JSON.stringify(users, null, 2));
}
process.exit(0);
