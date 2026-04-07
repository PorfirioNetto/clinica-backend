import {readFileSync,readdirSync} from 'fs'
import {join,dirname} from 'path'
import {fileURLToPath} from 'url'
import postgres from 'postgres'
import 'dotenv/config'
const __dirname=dirname(fileURLToPath(import.meta.url))
const sql=postgres(process.env.DATABASE_URL,{ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false})
async function migrar(){
  await sql`CREATE TABLE IF NOT EXISTS _migrations(id SERIAL PRIMARY KEY,nome TEXT UNIQUE NOT NULL,rodou_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  const pasta=join(__dirname,'../migrations');const arquivos=readdirSync(pasta).filter(f=>f.endsWith('.sql')).sort()
  for(const a of arquivos){const [ja]=await sql`SELECT id FROM _migrations WHERE nome=${a}`;if(ja)continue;const c=readFileSync(join(pasta,a),'utf-8');await sql.unsafe(c);await sql`INSERT INTO _migrations(nome) VALUES(${a})`;console.log('OK: '+a)}
  await sql.end()
}
migrar().catch(err=>{console.error(err.message);process.exit(1)})