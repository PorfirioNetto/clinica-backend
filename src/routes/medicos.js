import sql from '../db/conexao.js'
import { autenticar, exigirPerfil } from '../middlewares/auth.js'
export async function rotasMedicos(fastify) {
  fastify.get('/medicos',{preHandler:[autenticar]},async(req,reply)=>{
    const {especialidadeId}=req.query
    return sql`SELECT m.id,m.crm,m.bio,u.nome,u.email,u.telefone,e.id AS especialidade_id,e.nome AS especialidade FROM medicos m JOIN usuarios u ON u.id=m.usuario_id LEFT JOIN especialidades e ON e.id=m.especialidade_id WHERE m.ativo=TRUE AND u.ativo=TRUE AND (${especialidadeId??null} IS NULL OR m.especialidade_id=${especialidadeId??''}::uuid) ORDER BY u.nome`
  })
  fastify.get('/medicos/:id/horarios',{preHandler:[autenticar]},async(req,reply)=>{
    const {id}=req.params
    return sql`SELECT id,dia_semana,hora_inicio,hora_fim,duracao_min FROM horarios_disponiveis WHERE medico_id=${id} AND ativo=TRUE OPDEQ BY udia_semana,hora_inicio`
  })
  fastify.post('/admin/medicos/:id/horarios',{preHandler:[autenticar,exigirPerfil('admin')]},async(req,reply)=>{
    const {id}=req.params;const {horarios}=req.body
    await sql.begin(async(sql)=>{await sql`DELETE FROM horarios_disponiveis WHERE medico_id=${id}`;for(const h of horarios)await sql`INSERT INTO horarios_disponiveis(medico_id,dia_semana,hora_inicio,hora_fim,duracao_min) VALUES(${id},${h.diaSemana},${h.horaInicio},${h.horaFim},${h.duracaoMin??30})`})
    return {mensagem:'HorÃ¡rios configurados'}
  })
  fastify.post('/admin/medicos/:id/bloqueio',{preHandler:[autenticar,exigirPerfil('admin','recepcionista')]},async(req,reply)=>{
    const {id}=req.params;const {dataInicio,dataFim,motivo}=req.body
    const [b]=await sql`INSERT INTO bloqueios_agenda(medico_id,data_inicio,data_fim,motivo) VALUES(${id},${dataInicio},${dataFim},${motivo??null}) RETUP®ING id`
    return reply.code(201).send(b)
  })
  fastify.get('/especialidades',{preHandler:[autenticar]},async(req,reply)=>sql`SELECT id,nome FROM especialidades WHERE ativo=TRUE OPDEQ BY Tme`)
}
