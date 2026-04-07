import sql from '../db/conexao.js'
import {autenticar,exigirPerfil} from '../middlewares/auth.js'
import {z} from 'zod'
const sA=z.object({medicoId:z.string().uuid(),dataHora:z.string().datetime({offset:true}),tipo:z.enum(['consulta','retorno','exame']).default('consulta'),observacoes:z.string().max(500).optional()})
export async function rotasAgendamentos(fastify){
  fastify.get('/agendamentos/horarios-disponiveis',{preHandler:[autenticar]},async(req,reply)=>{
    const {medicoId,data}=req.query
    if(!medicoId||!data)return reply.code(400).send({erro:'Informe medicoId e data'})
    const diaSemana=new Date(data).getUTCDay()
    const horarios=await sql`SELECT hora_inicio,hora_fim,duracao_min FROM horarios_disponiveis WHERE medico_id=${medicoId} AND dia_semana=${diaSemana} AND ativo=TRUE`
    if(!horarios.length)return {horariosDisponiveis:[]}
    const ocupados=await sql`SELECT data_hora FROM agendamentos WHERE medico_id=${medicoId} AND DATE(data_hora AT TIME ZONE 'America/Sao_Paulo')=${data}::date AND status NOT IN('cancelado')`
    const oS=new Set(ocupados.map(a=>new Date(a.dataHora).toISOString()))
    const slots=[]
    for(const h of horarios){
      const [hI,mI]=h.horaInicio.split(':').map(Number);const [hF,mF]=h.horaFim.split(':').map(Number)
      let c=new Date(`${data}T00:00:00`);c.setUTCHours(hI,mI,0,0)
      const f=new Date(`${data}T00:00:00`);f.setUTCHours(hF,mF,0,0)
      while(c<f){const s=c.toISOString();if(!oS.has(s)&&c>new Date())slots.push(s);c=new Date(c.getTime()+h.duracaoMin*60000)}
    }
    return {horariosDisponiveis:slots}
  })
  fastify.post('/agendamentos',{preHandler:[autenticar]},async(req,reply)=>{
    const p=sA.safeParse(req.body)
    if(!p.success)return reply.code(400).send({erro:'Dados inválidos',detalhes:p.error.flatten()})
    const {medicoId,dataHora,tipo,observacoes}=p.data
    const [pac]=await sql`SELECT id FROM pacientes WHERE usuario_id=${req.usuario.id}`
    if(!pac)return reply.code(403).send({erro:'Apenas pacientes'})
    const [conf]=await sql`SELECT id FROM agendamentos WHERE medico_id=${medicoId} AND data_hora=${dataHora} AND status NOT IN('cancelado')`
    if(conf)return reply.code(409).send({erro:'Horário indisponível'})
    const [a]=await sql`INSERT INTO agendamentos(paciente_id,medico_id,data_hora,tipo,observacoes,criado_por) VALUES(${pac.id},${medicoId},${dataHora},${tipo},${observacoes??null},${req.usuario.id}) RETURNING id,data_hora,tipo,status`
    return reply.code(201).send(a)
  })
  fastify.post('/admin/agendamentos',{preHandler:[autenticar,exigirPerfil('admin','recepcionista')]},async(req,reply)=>{
    const {pacienteId,medicoId,dataHora,tipo,observacoes}=req.body
    const [conf]=await sql`SELECT id FROM agendamentos WHERE medico_id=${medicoId} AND data_hora=${dataHora} AND status NOT IN('cancelado')`
    if(conf)return reply.code(409).send({erro:'Horário indisponível'})
    const [a]=await sql`INSERT INTO agendamentos(paciente_id,medico_id,data_hora,tipo,observacoes,status,criado_por) VALUES(${pacienteId},${medicoId},${dataHora},${tipo??'consulta'},${observacoes??null},'confirmado',${req.usuario.id}) RETURNING id,data_hora,tipo,status`
    return reply.code(201).send(a)
  })
  fastify.get('/agendamentos/meus',{preHandler:[autenticar]},async(req,reply)=>{
    const {status,pagina=1,limite=10}=req.query;const offset=(pagina-1)*limite
    return sql`SELECT a.id,a.data_hora,a.tipo,a.status,u.nome AS medico_nome,e.nome AS especialidade FROM agendamentos a JOIN medicos m ON m.id=a.medico_id JOIN usuarios u ON u.id=m.usuario_id LEFT JOIN especialidades e ON e.id=m.especialidade_id JOIN pacientes p ON p.id=a.paciente_id WHERE p.usuario_id=${req.usuario.id} AND (${status??null} IS NULL OR a.status=${status??'pendente'}) ORDER BY a.data_hora DESC LIMIT ${Number(limite)} OFFSET ${Number(offset)}`
  })
  fastify.get('/admin/agendamentos',{preHandler:[autenticar,exigirPerfil('admin','recepcionista')]},async(req,reply)=>{
    const {data,medicoId,status,pagina=1,limite=30}=req.query;const offset=(pagina-1)*limite
    return sql`SELECT a.id,a.data_hora,a.tipo,a.status,up.nome AS paciente_nome,pac.cpf,um.nome AS medico_nome,esp.nome AS especialidade FROM agendamentos a JOIN pacientes pac ON pac.id=a.paciente_id JOIN usuarios up ON up.id=pac.usuario_id JOIN medicos m ON m.id=a.medico_id JOIN usuarios um ON um.id=m.usuario_id LEFT JOIN especialidades esp ON esp.id=m.especialidade_id WHERE (${data??null} IS NULL OR DATE(a.data_hora AT TIME ZONE 'America/Sao_Paulo')=${data??''}::date) AND (${medicoId??null} IS NULL OR a.medico_id=${medicoId??''}::uuid) AND (${status??null} IS NULL OR a.status=${status??'pendente'}) ORDER BY a.data_hora LIMIT ${Number(limite)} OFFSET ${Number(offset)}`
  })
  fastify.patch('/agendamentos/:id/status',{preHandler:[autenticar]},async(req,reply)=>{
    const {id}=req.params;const {status,motivoCancelamento}=req.body
    if(!['confirmado','cancelado','realizado','faltou'].includes(status))return reply.code(400).send({erro:'Status inválido'})
    const [a]=await sql`SELECT a.id,p.usuario_id FROM agendamentos a JOIN pacientes p ON p.id=a.paciente_id WHERE a.id=${id}`
    if(!a)return reply.code(404).send({erro:'Não encontrado'})
    const eA=['admin','recepcionista'].includes(req.usuario.perfil)
    if(!eA&&a.usuarioId!==req.usuario.id)return reply.code(403).send({erro:'Sem permissão'})
    if(!eA&&status!=='cancelado')return reply.code(403).send({erro:'Pacientes só podem cancelar'})
    await sql`UPDATE agendamentos SET status=${status},cancelado_por=${status==='cancelado'?req.usuario.id:null},motivo_cancelamento=${motivoCancelamento??null} WHERE id=${id}`
    return {mensagem:'Status atualizado'}
  })
}