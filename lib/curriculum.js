// iSpeak · trilha de aprendizado (Pré-A1 → C2), baseada no documento "Trilha de Aprendizado".
// Cada módulo é uma competência ("consegue fazer X") avaliada nas conversas.

export const THEMES = ['dia a dia', 'trabalho', 'restaurante', 'viagem', 'saúde', 'compras', 'social'];

const m = (code, tema, titulo, gramatica, vocab, tarefa) => ({ code, tema, titulo, gramatica, vocab, tarefa });

export const LEVELS = [
  {
    id: 'PRE_A1', nome: 'Pré-A1', xp: 0, pt: 70, rate: 0.85,
    meta: 'Cumprimentar, se apresentar, soletrar o nome e contar até 20.',
    estilo: 'Frases em inglês de 2 a 6 palavras, bem devagar. Explique quase tudo em português. Peça para o aluno repetir frases curtas. Aceite respostas em português e devolva a versão em inglês para ele repetir.',
    modulos: [
      m('PRE_A1.1', 'social', 'Sons e alfabeto', 'alfabeto, sons th, h, vogais curtas e longas', 'letras, nome e sobrenome', 'soletrar o próprio nome em inglês'),
      m('PRE_A1.2', 'social', 'Cumprimentos', 'Hello, Hi, Good morning, How are you?, I\'m fine, thanks', 'cumprimentos e despedidas', 'cumprimentar e responder "How are you?"'),
      m('PRE_A1.3', 'social', 'Apresentação', 'My name is..., I\'m from..., Nice to meet you', 'países, nacionalidades', 'se apresentar em 4 frases'),
      m('PRE_A1.4', 'dia a dia', 'Verbo to be', 'I am, you are, he/she is', 'happy, tired, hungry, busy', 'dizer como está se sentindo'),
      m('PRE_A1.5', 'dia a dia', 'Números e hora', 'números 0–100, How old are you?, What time is it?', 'números, idade, telefone', 'dizer a idade e um número de telefone'),
      m('PRE_A1.6', 'dia a dia', 'Objetos e cores', 'This is..., What is this?, a/an', 'cores, objetos da casa', 'nomear objetos e cores à sua volta'),
      m('PRE_A1.7', 'social', 'Sobrevivência', 'I don\'t understand, Can you repeat?, Speak slowly, please', 'expressões de ajuda', 'pedir para repetir e dizer que não entendeu, em inglês'),
    ],
  },
  {
    id: 'A1', nome: 'A1', xp: 600, pt: 40, rate: 0.9,
    meta: 'Falar de si, da família, da rotina e dos gostos em frases simples.',
    estilo: 'Frases curtas e simples em inglês, vocabulário básico. Use português para explicar correções e palavras novas.',
    modulos: [
      m('A1.1', 'dia a dia', 'Rotina', 'present simple (I, you, we, they), horários', 'verbos do dia a dia', 'contar como é o seu dia'),
      m('A1.2', 'social', 'Família e pessoas', 'possessivos, have/has, he/she/it', 'família, adjetivos de descrição', 'apresentar a família'),
      m('A1.3', 'dia a dia', 'Casa e lugares', 'there is/there are, in/on/under/next to', 'cômodos, móveis, lugares da cidade', 'descrever a casa e o bairro'),
      m('A1.4', 'restaurante', 'Comida e bebida', 'I\'d like..., Can I have...?, some/any', 'alimentos, bebidas, cardápio', 'pedir um café ou lanche'),
      m('A1.5', 'compras', 'Compras', 'How much?, this/that/these/those, números até 1.000', 'roupas, preços', 'comprar uma roupa'),
      m('A1.6', 'social', 'Gostos e hobbies', 'like/love/hate + -ing, do/does em perguntas', 'esportes, música, lazer', 'falar do que gosta de fazer'),
      m('A1.7', 'viagem', 'Habilidades e pedidos', 'can/can\'t, imperativo, please', 'verbos de ação, pedidos educados', 'pedir ajuda e instruções simples'),
      m('A1.8', 'dia a dia', 'Agora e clima', 'present continuous, dias e meses', 'clima, atividades do momento', 'dizer o que está fazendo e como está o tempo'),
    ],
  },
  {
    id: 'A2', nome: 'A2', xp: 3000, pt: 20, rate: 0.95,
    meta: 'Resolver tarefas do dia a dia e contar fatos passados e planos.',
    estilo: 'Inglês simples e claro, frases conectadas com and, but, because. Português só para explicar uma correção difícil.',
    modulos: [
      m('A2.1', 'dia a dia', 'Fim de semana passado', 'past simple (regulares e irregulares), was/were', 'verbos no passado, yesterday, last weekend', 'contar o que fez no fim de semana'),
      m('A2.2', 'viagem', 'Viagem e transporte', 'direções, preposições de movimento', 'aeroporto, hotel, ônibus, táxi', 'fazer check-in no hotel e pedir direções'),
      m('A2.3', 'compras', 'Compras e serviços', 'comparativos e superlativos', 'lojas, tamanhos, trocas', 'trocar um produto na loja'),
      m('A2.4', 'restaurante', 'Restaurante completo', 'much/many/a lot of, would like', 'menu, conta, gorjeta', 'pedir, comentar a comida e pagar'),
      m('A2.5', 'social', 'Planos', 'going to, will, present continuous para futuro', 'agenda, convites', 'combinar um encontro'),
      m('A2.6', 'saúde', 'Saúde', 'should/shouldn\'t, have to, partes do corpo', 'sintomas, farmácia', 'descrever um problema ao médico'),
      m('A2.7', 'trabalho', 'Trabalho e estudo', 'present simple vs. continuous, advérbios de frequência', 'profissões, escritório', 'explicar o que faz no trabalho'),
      m('A2.8', 'social', 'Experiências', 'present perfect com ever/never', 'viagens, comidas, atividades', 'perguntar e responder "Have you ever...?"'),
    ],
  },
  {
    id: 'B1', nome: 'B1', xp: 8000, pt: 5, rate: 1,
    meta: 'Manter uma conversa de 5+ minutos e dar opiniões com motivos.',
    estilo: 'Inglês natural em ritmo calmo. Português só se o aluno travar de verdade ou pedir.',
    modulos: [
      m('B1.1', 'social', 'Contar experiências', 'present perfect vs. past simple, past continuous', 'narrativa, expressões de tempo', 'contar uma viagem ou história marcante'),
      m('B1.2', 'trabalho', 'Trabalho e carreira', 'used to, present perfect continuous', 'carreira, habilidades, currículo', 'responder uma entrevista de emprego'),
      m('B1.3', 'social', 'Opiniões', 'because, although, however, 1st conditional', 'opinião, concordar e discordar', 'debater um tema simples dando motivos'),
      m('B1.4', 'viagem', 'Imprevistos em viagem', 'might, must, can\'t (dedução), 2nd conditional', 'atraso, bagagem, reclamações', 'resolver um voo cancelado'),
      m('B1.5', 'saúde', 'Saúde e hábitos', 'voz passiva (presente e passado), quantificadores', 'alimentação, exercício, sono', 'falar de hábitos e mudanças'),
      m('B1.6', 'dia a dia', 'Notícias e tecnologia', 'discurso indireto básico, orações relativas', 'mídia, tecnologia', 'resumir uma notícia'),
      m('B1.7', 'social', 'Planos e sonhos', 'formas de futuro, wish', 'metas, mudanças de vida', 'falar dos seus objetivos'),
      m('B1.8', 'trabalho', 'Reuniões', 'registro formal vs. informal, phrasal verbs comuns', 'reunião, prazos, tarefas', 'participar de uma reunião simples'),
    ],
  },
  {
    id: 'B2', nome: 'B2', xp: 18000, pt: 0, rate: 1,
    meta: 'Interagir com nativos com naturalidade e debater pontos de vista.',
    estilo: 'Inglês natural, ritmo normal, sem português (só se o aluno pedir).',
    modulos: [
      m('B2.1', 'social', 'Argumentar e debater', '3rd conditional, mixed conditionals, conectores avançados', 'substantivos abstratos, argumentação', 'defender um ponto de vista num debate'),
      m('B2.2', 'trabalho', 'Negócios', 'voz passiva, causativa, discurso indireto completo', 'vocabulário corporativo', 'apresentar uma proposta e negociar'),
      m('B2.3', 'trabalho', 'Entrevista em empresa americana', 'perfect continuous, future perfect', 'soft skills, resultados', 'responder perguntas comportamentais'),
      m('B2.4', 'social', 'Cultura e mídia', 'orações com particípio, ênfase', 'cinema, séries, arte', 'discutir um filme ou notícia'),
      m('B2.5', 'social', 'Phrasal verbs e idioms', 'phrasal verbs separáveis e não separáveis', 'idioms americanos comuns', 'conversar informalmente como um nativo'),
      m('B2.6', 'dia a dia', 'Hipóteses e arrependimentos', 'wish/if only, would rather', 'decisões, consequências', 'falar de escolhas passadas'),
      m('B2.7', 'compras', 'Reclamações formais', 'hedging, registro formal', 'atendimento, contratos', 'reclamar com um serviço e negociar solução'),
      m('B2.8', 'trabalho', 'Apresentações', 'marcadores de discurso, signposting', 'estrutura de apresentação', 'apresentar um tema por 3 minutos'),
    ],
  },
  {
    id: 'C1', nome: 'C1', xp: 32000, pt: 0, rate: 1.05,
    meta: 'Falar com fluência e flexibilidade em contextos sociais e profissionais.',
    estilo: 'Inglês americano natural em ritmo real, com gírias, idioms e implícitos. Não simplifique.',
    modulos: [
      m('C1.1', 'social', 'Argumentação sofisticada', 'inversão, cleft sentences', 'collocations, termos abstratos', 'debater política pública ou economia'),
      m('C1.2', 'trabalho', 'Registro e tom', 'alternar formal e informal, diplomacia, hedging', 'eufemismos, cortesia', 'dar um feedback difícil'),
      m('C1.3', 'social', 'Humor e ironia', 'implícito, understatement', 'sarcasmo, jogos de palavras', 'conversar com humor e ironia'),
      m('C1.4', 'trabalho', 'Negócios avançado', 'linguagem de liderança e persuasão', 'estratégia, finanças, gestão', 'liderar uma reunião ou fazer um pitch'),
      m('C1.5', 'social', 'Inglês coloquial americano', 'fala conectada, reduções (gonna, wanna)', 'gírias, expressões regionais', 'acompanhar uma conversa rápida entre amigos'),
      m('C1.6', 'social', 'Nuances culturais', 'small talk, normas sociais dos EUA', 'referências culturais', 'fazer networking num evento'),
      m('C1.7', 'dia a dia', 'Storytelling', 'tempos narrativos, ritmo e suspense', 'descrição vívida', 'contar uma história envolvente'),
      m('C1.8', 'trabalho', 'Técnico e acadêmico', 'nominalização, linguagem impessoal', 'termos da área do aluno', 'explicar um tema complexo a um leigo'),
    ],
  },
  {
    id: 'C2', nome: 'C2', xp: 50000, pt: 0, rate: 1.05,
    meta: 'Expressar-se com precisão e nuance em qualquer situação.',
    estilo: 'Inglês nativo, ritmo real, vocabulário rico, nuances e referências culturais.',
    modulos: [
      m('C2.1', 'social', 'Precisão e matiz', 'diferenças sutis de sentido', 'sinônimos e nuance', 'dizer a mesma ideia em três registros'),
      m('C2.2', 'trabalho', 'Mediar e liderar', 'conduzir pessoas, resolver conflitos', 'mediação', 'mediar uma discussão'),
      m('C2.3', 'social', 'Retórica e persuasão', 'estrutura de discurso, apelos', 'retórica', 'fazer um discurso improvisado'),
      m('C2.4', 'viagem', 'Sotaques e regionalismos', 'Sul, Nova York, Costa Oeste', 'expressões raras', 'conversar com pessoas de regiões diferentes'),
      m('C2.5', 'social', 'Abstração', 'filosofia, ética, hipóteses complexas', 'termos abstratos', 'debater um tema abstrato'),
      m('C2.6', 'dia a dia', 'Compreensão difícil', 'fala rápida, interrupções, sobreposição', 'linguagem informal densa', 'acompanhar uma conversa difícil'),
      m('C2.7', 'trabalho', 'Reformulação e resumo', 'resumir argumentos longos', 'paráfrase', 'resumir um debate complexo'),
    ],
  },
];

export const LEVEL_IDS = LEVELS.map(l => l.id);
export const getLevel = id => LEVELS.find(l => l.id === id) || LEVELS[0];
export const nextLevel = id => LEVELS[LEVEL_IDS.indexOf(id) + 1] || null;
export const allModules = () => LEVELS.flatMap(l => l.modulos.map(x => ({ ...x, level: l.id })));
export const getModule = code => allModules().find(x => x.code === code) || null;

// Regras de promoção (ver documento): XP ≥ meta do próximo nível, 80% das competências ≥ 70 e prova ≥ 70.
export const RULES = {
  masteryOk: 70,
  shareOk: 0.8,
  evalPass: 70,
  evalCooldown: 3,
  evidences: 5,
};
