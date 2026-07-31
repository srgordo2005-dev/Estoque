const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://paelbarlmayswqilhoxa.supabase.co';
const supabaseKey = 'sb_publishable_6Kz2o4DWlxhBgc7oyDt2AA_KmphGK-h';
global.WebSocket = require('ws');
const supabase = createClient(supabaseUrl, supabaseKey);

async function findRamon() {
    console.log("Fetching all hashes...");
    let all = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase.from('hashes').select('*').range(from, from + 999);
        if (error) {
            console.error(error);
            break;
        }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 1000) break;
        from += 1000;
    }
    
    console.log("Total hashes fetched:", all.length);
    for (const h of all) {
        if (h.data && typeof h.data === 'string') {
            if (h.data.toLowerCase().includes('ramon')) {
                console.log("Found in Hash:", h.id, h.data);
            }
        }
    }
}

findRamon();
