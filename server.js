import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from Vite build directory if available
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://paelbarlmayswqilhoxa.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_6Kz2o4DWlxhBgc7oyDt2AA_KmphGK-h';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('[HashStock Cloud Worker] Servidor 24/7 de Sincronização em Nuvem (Render) iniciado!');

// Worker de segundo plano 24/7 para envio da planilha do Google
async function processCloudSheetQueue() {
    try {
        const { data: queueRows, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('employee_id', 'sheet_sync_queue')
            .limit(25);

        if (error) {
            console.error('[HashStock Cloud Worker] Erro ao consultar Supabase:', error.message);
            return;
        }

        if (!queueRows || queueRows.length === 0) return;

        console.log(`[HashStock Cloud Worker] Processando ${queueRows.length} item(ns) pendente(s) da planilha...`);

        for (const row of queueRows) {
            try {
                const item = JSON.parse(row.admin_notes || '{}');
                const { url, action, payload } = item;

                if (!url) {
                    await supabase.from('sessions').delete().eq('id', row.id);
                    continue;
                }

                // Envia para o Webhook do Google Apps Script com suporte a redirecionamentos
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ batch: [{ action, payload }] }),
                    redirect: 'follow'
                });

                const data = await res.json().catch(() => ({}));
                if (!data.error) {
                    console.log(`[HashStock Cloud Worker] ✓ Sucesso: "${action}" sincronizado na planilha (ID: ${row.id})`);
                    await supabase.from('sessions').delete().eq('id', row.id);
                } else {
                    console.error(`[HashStock Cloud Worker] Erro do Google Apps Script no item ${row.id}:`, data.error);
                }
            } catch (err) {
                console.error(`[HashStock Cloud Worker] Falha ao enviar item ${row.id}:`, err.message);
            }
        }
    } catch (e) {
        console.error('[HashStock Cloud Worker] Erro inesperado no worker:', e.message);
    }
}

// Inicia o worker a cada 4 segundos na nuvem
setInterval(processCloudSheetQueue, 4000);

// Health check endpoint
app.get('/health', (req, res) => {
    res.send('OK');
});

// Fallback route: serve index.html or worker status JSON
app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({
            ok: true,
            service: 'HashStock 24/7 Cloud Sheet Sync Worker (Render)',
            status: 'online',
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(PORT, () => {
    console.log(`✅ HashStock Cloud Worker rodando na porta ${PORT}`);
});
