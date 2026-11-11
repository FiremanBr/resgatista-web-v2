# Resgatista Web 3.0

Plataforma de avaliações do Resgatista, evoluída a partir da versão Web 2.0. Esta versão preserva os recursos existentes e acrescenta o modo de apresentação dos resultados ao vivo.

## Recursos
- Login de instrutor pelo Supabase Auth.
- Criação e listagem de turmas.
- Cadastro de até 20 questões por JSON.
- Ativação/encerramento da avaliação.
- Prova pública por link/QR Code.
- Correção no servidor: o gabarito não é enviado ao aluno.
- Painel de resultados, notas e estatísticas por questão.
- Atualização em tempo real.
- Exclusão individual e reinicialização com PIN.
- Modo de apresentação em tela cheia, com indicadores da turma e desempenho por questão.

## Configuração local
1. Instale Node.js LTS.
2. Copie `.env.example` para `.env`.
3. No Supabase, abra Project Settings > API Keys e copie a chave `publishable` para `VITE_SUPABASE_ANON_KEY`.
4. Execute `npm install` e `npm run dev`.
5. Para compilar: `npm run build`.

Projeto Supabase: `zxdnyadoouqfmfptypae`
URL: `https://zxdnyadoouqfmfptypae.supabase.co`
Edge Function: `resgatista-v2-api`

Use a mesma conta de autenticação do Supabase. Não coloque service_role/secret key no `.env` do frontend.

Para publicar, conecte o repositório a Vercel, Netlify ou Cloudflare Pages e configure as variáveis de ambiente. Configure fallback de SPA para `index.html`.
