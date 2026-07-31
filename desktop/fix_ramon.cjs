const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://paelbarlmayswqilhoxa.supabase.co';
const supabaseKey = 'sb_publishable_6Kz2o4DWlxhBgc7oyDt2AA_KmphGK-h';
global.WebSocket = require('ws');
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixHashes() {
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
    let count = 0;
    for (const h of all) {
        let changed = false;
        let update = {};
        
        if (h.data && typeof h.data === 'string') {
            try {
                let parsed = JSON.parse(h.data);
                if (parsed.location && parsed.location.toLowerCase().includes('ramon')) {
                    console.log(\`Hash \${parsed.sn} has location: \${parsed.location}\`);
                    parsed.location = ""; // clear location
                    update.data = JSON.stringify(parsed);
                    changed = true;
                }
                if (parsed.status && parsed.status.toLowerCase().includes('ramon')) {
                    console.log(\`Hash \${parsed.sn} has status: \${parsed.status}\`);
                    parsed.status = "STOCK"; // default to STOCK
                    update.data = JSON.stringify(parsed);
                    changed = true;
                }
                if (parsed.destino && parsed.destino.toLowerCase().includes('ramon')) {
                    console.log(\`Hash \${parsed.sn} has destino: \${parsed.destino}\`);
                    parsed.destino = "";
                    update.data = JSON.stringify(parsed);
                    changed = true;
                }
            } catch (e) {}
        }
        
        if (changed) {
            console.log("Updating:", update);
            const { error } = await supabase.from('hashes').update(update).eq('id', h.id);
            if (error) console.error("Error updating:", error);
            else count++;
        }
    }
    console.log("Fixed", count, "hashes.");
}

fixHashes();
