import postgres from 'postgres'
import 'dotenv/config'
const sql = postgres(process.env.DATABASE_URL, {max:20,idle_timeout:30,connect_timeout:10,ssl:process.env.NODE_ENV === 'production'?{rejectUnauthorized:false}:false,transform:{column:postgres.camel},onnotice:()=>{}})
export default sql
export async function conectarBanco(){try{await sql`SELECT 1`;console.log('Banco conectado')}catch(err){console.error('Erro banco:',err.message);process.exit(1)}}