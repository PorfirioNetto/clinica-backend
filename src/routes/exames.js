import sql from '../db/conexao.js'
import {autenticar,exigirPerfil} from '../middlewares/auth.js'
export async function rotasExames(fastify){
  fastify.get('/exames/meus',{preHandler:[autenticar]},async(req,reply)=>{
    const {status}=req.query
    return sql`SELECT e.id,e.status,e.data_solicitacao,e.data_coleta,e.data_resultado,e.arquivo_url,e.arquivo_nome,e.observacoes,te.nome AS tipo_exame,te.preparo,um.nome AS medico_nome FROM exames e JOIN pacientes p ON p.id=e.paciente_id LEFT JOIN tipos_exame te ON te.id=e.tipo_exame_id LEFT JOIN medicos m ON m.id=e.medico_id LEFT JOIN usuarios um ON um.id=m.usuario_id WHERE p.usuario_id=${req.usuario.id} AND (${status??null} IS NULL OR e.status=${status??'solicitado'}) ORDER BY e.criado_em DESC`
  })
  fastify.get('/exames/:id',{preHandler:[autenticar]},async(req,reply)=>{
    const {id}=req.params
    const [e]=await sql`SELECT e.id,e.status,e.data_solicitacao,e.data_coleta,e.data_resultado,e.arquivo_url,e.arquivo_nome,e.observacoes,te.nome AS tipo_exame,te.preparo,te.descricao,um.nome AS medico_nome,m.crm,up.nome AS paciente_nome FROM exames e JOIN pacientes p ON p.id=e.paciente_id JOIN usuarios up ON up.id=p.usuario_id LEFT JOIN tipos_exame te ON te.id=e.tipo_exame_id LEFT JOIN medicos m ON m.id=e.medico_id LEFT JOIN usuarios um ON um.id=m.usuario_id WHERE e.id=${id}`
    if(!e)return reply.code(404).send({erro:'Exame não encontrado'})
    const eA=['admin','recepcionista','medico'].includes(req.usuario.perfil)
    const [pac]=await sql`SELECT usuario_id FROM pacientes WHERE id=(SELECT paciente_id FROM exames WHERE id=${id})`
    if(!eA&&pac.usuarioId!==req.usuario.id)return reply.code(403).send({erro:'Acesso negado'})
    return e
  })
  fastify.post('/admin/exames',{preHandler:[autenticar,exigirPerfil('admin','recepcionista','medico')]},async(req,reply)=>{
    const {pacienteId,tipoExameId,agendamentoId,medicoId,observacoes}=req.body
    const [e]=await sql`INSERT INTO exames(paciente_id,tipo_exame_id,agendamento_id,medico_id,observacoes) VALUES(${pacienteId},${tipoExameId??null},${agendamentoId??null},${medicoId??null},${observacoes??null}) RETURNING id,status,data_solicitacao`
    return reply.code(201).send(e)
  })
  fastify.patch('/admin/exames/:id/status',{preHandler:[autenticar,exigirPerfil('admin','recepcionista','medico')]},async(req,reply)=>{
    const {id}=req.params;const {status,dataColeta,dataResultado,arquivoUrl,arquivoNome}=req.body
    await sql`UPDATE exames SET status=${status},data_coleta=COALESCE(${dataColeta??null},data_coleta),data_resultado=COALESCE(${dataResultado??null},data_resultado),arquivo_url=COALESCE(${arquivoUrl??null},arquivo_url),arquivo_nome=COALESCE(${arquivoNome??null},arquivo_nome) WHERE id=${id}`
    return {mensagem:'Exame atualizado'}
  })
  fastify.get('/admin/exames',{preHandler:[autenticar,exigirPerfil('admin','recepcionista','medico')]},async(req,reply)=>{
    const {status,pacienteId,pagina=1,limite=30}=req.query;const offset=(pagina-1)*limite
    return sql`SELECT e.id,e.status,e.data_solicitacao,e.data_coleta,e.arquivo_nome,te.nome AS tipo_exame,up.nome AS paciente_nome,pac.cpf,um.nome AS medico_nome FROM exames e JOIN pacientes pac ON pac.id=e.paciente_id JOIN usuarios up ON up.id=pac.usuario_id LEFT JOIN tipos_exame te ON te.id=e.tipo_exame_id LEFT JOIN medicos m ON m.id=e.medico_id LEFT JOIN usuarios um ON um.id=m.usuario_id WHERE (${status??null} IS NULL OR e.status=${status??'solicitado'}) AND (${pacienteId??null} IS NULL OR e.paciente_id=${pacienteId??''}::uuid) ORDER BY e.criado_em DESC LIMIT ${Number(limite)} OFFSET ${Number(offset)}`
  })
}