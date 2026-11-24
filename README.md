# iSpeak

Aprenda inglês americano conversando com o **Rafa**, um professor brasileiro que escuta, corrige no fim da frase e lembra das aulas anteriores. Trilha do zero (Pré-A1) ao C2, com XP, prova de nível e nota de 0 a 100 por conversa.

Site estático (HTML + JS, sem build) com funções da Vercel em `api/`. Banco e login no Supabase. O texto do professor e a avaliação vêm da OpenAI; a voz usa o reconhecimento e a fala do próprio navegador (grátis).

## Colocar no ar

### 1. Supabase (projeto novo)
1. Crie um projeto em supabase.com.
2. Em **Authentication > Sign In / Providers > Email**, desligue **Confirm email**.
3. Em **SQL Editor**, cole e rode `supabase/schema.sql` (pode rodar de novo sem problema).
4. Em **Project Settings > API**, copie a **Project URL**, a chave **anon/publishable** e a chave **service_role** (essa é secreta: só vai na Vercel).

### 2. OpenAI
Crie uma chave em platform.openai.com > API keys e coloque crédito na conta.

### 3. Vercel
1. Em vercel.com: **Add New > Project**, escolha o repositório. Framework Preset: **Other**. Não preencha build nem output.
2. Em **Settings > Environment Variables**, cadastre:

| Variável | Valor |
| --- | --- |
| `OPENAI_API_KEY` | sua chave da OpenAI |
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_ANON_KEY` | chave anon/publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (secreta) |
| `ISPEAK_SECRET` | um texto aleatório longo (ex.: rode `openssl rand -hex 32`) |
| `CHAT_MODEL` | opcional, padrão `gpt-6-luna` |
| `EVAL_MODEL` | opcional, padrão `gpt-6-luna` |
| `DAILY_SESSION_LIMIT` | opcional, conversas por aluno por dia, padrão 20 |

3. Faça o deploy. No Supabase, em **Authentication > URL Configuration**, coloque o endereço do site em **Site URL**.

## Como funciona

- **Login sem e-mail** (mesmo padrão do Engefit): o `@usuário` vira um endereço técnico (`ana.silva` → `ana-silva@ispeak.vercel.app`) que não existe. Usuário não se repete nem muda. Senha esquecida: código de recuperação mostrado uma vez no cadastro (no banco fica só o hash; 5 tentativas por hora).
- **Conversa**: a primeira é sempre o nivelamento. O navegador ouve o aluno (mãos-livres; a fala termina após ~1,5 s de silêncio), manda o texto para `api/chat`, recebe a resposta do Rafa em streaming e fala frase a frase. O aluno não interrompe: o microfone desliga enquanto o Rafa fala. Dá para digitar, e a legenda é opcional.
- **Português do professor**: vem marcado como `[pt]...[/pt]`, para a voz trocar de idioma e a legenda destacar.
- **Encerrar** (`api/finish`): a transcrição é avaliada e descartada. Fica só o resumo, a nota (gramática 30%, vocabulário 30%, compreensão 20%, interação 20%), os acertos, as correções, as palavras novas e os rótulos de erros recorrentes. O áudio nunca sai do navegador.
- **XP e nível são calculados no servidor**: 5 XP por minuto falado + nota ÷ 2 + 30 pela missão + bônus de sequência. Para subir de nível: XP do próximo nível, 80% das competências do nível com domínio ≥ 70, e prova com nota ≥ 70. Reprovado, a prova libera de novo após 3 conversas.
- **Contexto assinado**: `api/start` monta o plano da aula (nível, tema, missão, memória) e assina com `ISPEAK_SECRET`, para o navegador não alterar o prompt.

## Arquivos

| Caminho | O que é |
| --- | --- |
| `index.html`, `app.js`, `style.css` | telas: entrar, início, conversa, resumo, progresso semanal, conta |
| `voice.js` | camada de voz (troque este arquivo para usar voz em tempo real no futuro) |
| `lib/curriculum.js` | trilha Pré-A1 → C2: módulos, competências, metas de XP |
| `lib/prompts.js` | persona e regras do Rafa; prompt e schema do avaliador |
| `lib/scoring.js` | nota, XP, sequência, domínio e regras de promoção |
| `api/*.js` | `config`, `me`, `start`, `chat`, `finish` |
| `supabase/schema.sql` | tabelas, segurança (RLS), login sem e-mail e recuperação |
| `tools/test.mjs` | testes (`node tools/test.mjs`) |

## Limites conhecidos

- A voz grátis funciona bem no **Chrome e no Edge**. Em outros navegadores, o aluno conversa digitando.
- O microfone entende um idioma por vez. Nos níveis Pré-A1 a A2 há um botão para alternar entre inglês e português.
- A pronúncia não é avaliada (só gramática, vocabulário, compreensão e interação).
- Os números de XP, pesos da nota e metas de vocabulário são uma primeira proposta: ajuste em `lib/curriculum.js` e `lib/scoring.js` depois de testar com alunos.
