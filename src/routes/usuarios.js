import sql from '../db/conexao.js'
import { admin } from '../db/firebase.js'
import { autenticar, exigirPerfil } from '../middlewares/auth.js'
import { z } from 'zod'

const schemaCadastro = z.object({
  nome: z.string().min(3),
  telefone: z.string().optional(),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF inválido'),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sexo: z.enum(['M', 'F', 'outro']).optional(),
  planoSaude: z.string().optional(),
  numeroPlano: z.string().optional(),
})

export async function rotasUsuarios(fastify) {
  fastify.post('/usuarios/cadastro', async (req, reply) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ erro: 'Token não fornecido' })
    let decoded
    try { decoded = await admin.auth().verifyIdToken(authHeader.slice(7)) }
    catch { return reply.code(401).send({ erro: 'Token Firebase inválido' }) }
    const parse = schemaCadastro.safeParse(req.body)
    if (!parse.success) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: parse.error.flatten() })
    const { nome, telefone, cpf, dataNascimento, sexo, planoSaude, numeroPlano } = parse.data
    const [cpfEx] = await sql`SELECT id FROM pacientes WHERE cpf = ${cpf}`
    if (cpfEx) return reply.code(409).send({ erro: 'CPF já cadastrado' })
    const [uidEx] = await sql`SELECT id FROM usuarios WHERE firebase_uid = ${decoded.uid}`
    if (uidEx) return reply.code(409).send({ erro: 'Usuário já cadastrado' })
    const resultado = await sql.begin(async (sql) => {
      const [u] = await sql`INSERT INTO usuarios (firebase_uid,email,nome,telefone,perfil) VALUES (${decoded.uid},${decoded.email},${nome},${telefone??null},'paciente') RETURNING id,nome,email,perfil`
      const [p] = await sql`INSERT INTO pacientes (usuario_id,cpf,data_nascimento,sexo,plano_saude,numero_plano) VALUES (${u.id},${cpf},${dataNascimento},${sexo??null},${planoSaude??null},${numeroPlano??null}) RETURNING id`
      return { usuario:u, pacienteId:p.id }
    })
    return reply.code(201).send({ mensagem:'Cadastro realizado', ...resultado })
  })
  fastify.get('/usuarios/me',{ preHandler:[autenticar] },async(req,reply) => {
    const [d] = await sql`SELECT u.id,u.nome,u.email,u.telefone,u.perfil,p.cpf,p.data_nascimento,p.sexo,p.plano_saude,p.numero_plano FROM usuarios u LEFT JOIN pacientes p ON p.usuario_id=u.id WHERE u.id=${req.usuario.id}`
    return d
  })
  fastify.put('/usuarios/me',{ preHandler:[autenticar] },async(req,reply) => {
    const {nome,telefone,planoSaude,numeroPlano}=req.body
    await sql`UPDATE usuarios SET nome=COALESCE(${nome??null},nome),telefone=COALESCE(${telefone??null},telefone) WHERE id=${req.usuario.id}`
    if(req.usuario.perfil==='paciente')await sql`UPDATE pacientes SET plano_saude=COALESCE(${planoSaude??null},plano_saude),
    numero_plano=COALESCE(${numeroPlano??null},numero_plano) WHERE usuario_id=${req.usuario.id}`
    return {mensagem:'Dados atualizados'}
  })
  fastify.get('/admin/usuarios',{preHandler:[autenticar,exigirPerfil('admin','recepcionista')]},async(req,reply) => {
    const {busca,perfil,pagina=1,limite=20}=req.query;const offset=(pagina-1)*limite
    const us = await sql`SELECT u.id,u.nome,u.email,u.perfil,u.ativo,u.criado_em,p.cpf FROM usuarios u LEFT JOIN pacientes p ON p.usuario_id=u.id WHERE (${busca??null} IS NULL OR u.nome ILIKE ${'%'+(busca??'')+'%'} OR p.cpf=${busca??''}) AND (${perfil??null} IS NULL OR u.perfil=${perfil??'paciente'}) OPDEQ BY u.criado_em DESC LIMIT ${Number(limite)} OFFSET ${Number(offset)}`
    const [{total}]=await sql`SELECT COUNT(*) as total FROM usuarios`
    return {usuarios:us,total:Number(total),pagina:Number(pagina),limite:Number(limite)}
  })
}
