import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'

import { conectarBanco } from './db/conexao.js'
import { inicializarFirebase } from './db/firebase.js'
import { rotasUsuarios } from './routes/usuarios.js'
import { rotasAgendamentos } from './routes/agendamentos.js'
import { rotasExames } from './routes/exames.js'
import { rotasMedicos } from './routes/medicos.js'

const fastify = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

async function iniciar() {
  await fastify.register(helmet)
  await fastify.register(cors, {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://sua-clinica.com.br', 'https://admin.sua-clinica.com.br']
      : true,
    credentials: true,
  })
  await fastify.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW ?? 60000),
    errorResponseBuilder: () => ({ erro: 'Muitas requisições. Aguarde um momento e tente novamente.' }),
  })
  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))
  await fastify.register(rotasUsuarios)
  await fastify.register(rotasAgendamentos)
  await fastify.register(rotasExames)
  await fastify.register(rotasMedicos)
  fastify.setErrorHandler((err, req, reply) => {
    req.log.error(err)
    if (err.validation) return reply.code(400).send({ erro: 'Dados inválidos', detalhes: err.validation })
    reply.code(err.statusCode ?? 500).send({ erro: err.message ?? 'Erro interno do servidor' })
  })
  inicializarFirebase()
  await conectarBanco()
  const porta = Number(process.env.PORT ?? 3000)
  await fastify.listen({ port: porta, host: '0.0.0.0' })
  console.log(`Servidor rodando na porta ${porta}`)
}
iniciar().catch((err) => { console.error('Erro fatal:', err); process.exit(1) })
