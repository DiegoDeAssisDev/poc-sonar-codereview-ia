const { Octokit } = require("@octokit/rest");
const { OpenAI } = require("openai");
const exec = require("child_process").execSync;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const pull_number = Number(process.env.GITHUB_REF.split("/")[2]);

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function getDiff() {
  const baseRef = process.env.GITHUB_BASE_REF || "main";
  try {
    return exec(`git diff origin/${baseRef}...HEAD`, { encoding: "utf8" });
  } catch (error) {
    console.error(`Erro ao pegar o diff contra ${baseRef}:`, error);
    return "";
  }
}

async function runReview() {
  console.log(`🚀 Iniciando Agente de Qualidade (Revisão) para PR #${pull_number} em ${owner}/${repo}`);

  const diff = await getDiff();
  if (!diff || diff.trim().length === 0) {
    console.log("Nenhuma alteração encontrada para revisão.");
    return;
  }

  const prompt = `
Você é o "Agente de Qualidade" Senior Especialista em Flutter.
Sua missão é gerar sugestões práticas no código e processar as correções com perfeição técnica.
Analise o git diff abaixo (no formato Unified Diff).

# REGRA PARA PRECISÃO DE NÚMERO DE LINHAS:
Siga estritamente esta contagem para não comentar fora do lugar:
1. Use o cabeçalho \`@@ -old,count +new,count @@\` ACIMA do bloco problemático.
2. A linha inicial é o valor de \`new_start\` (ex: \`@@ -10,3 +15,4 @@\`, a base é 15).
3. Conte as linhas (apenas \` \` e \`+\`) até o erro. Ignore \`-\`. 
4. Number = base + quantidade de linhas válidas puladas.

Formato OBRIGATÓRIO (JSON):
{
  "feedback": [
    {
      "file": "lib/teste.dart",
      "line": 45,
      "message": "Explicação técnica do porquê o código precisa melhorar (ex: Null Pointer, Tipo Incorreto).\\n\\n\`\`\`suggestion\\n// APENAS CÓDIGO CORRIGIDO AQUI.\\n\`\`\`"
    }
  ]
}

IMPORTANTE: 
1. Como o arquiteto exigiu "Gera Sugestões", você DEVE OBRIGATORIAMENTE usar o bloco \`\`\`suggestion para que o desenvolvedor aceite a alteração dentro do GitHub.
2. Escape as quebras de linha do JSON (\`\\n\`).
3. Se não houver problemas: { "feedback": [] }

Diff:
${diff}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Você responde estritamente em JSON. Sem Markdown fora da estrutura." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(raw);
    } catch (e) {
      console.error("Erro no parse do JSON:", raw);
      return;
    }

    const comments = Array.isArray(result.feedback) 
      ? result.feedback 
      : (Array.isArray(result) ? result : []);

    if (comments.length === 0) {
      console.log("✅ Agente de Qualidade não encontrou problemas.");
      return;
    }

    console.log(`⚠️ Agente de Qualidade gerou ${comments.length} sugestões.`);

    // 📍 COMENTÁRIOS INLINE FOCADOS EM "SUGGESTION"
    const reviewComments = comments
      .filter(c => c.file && c.line)
      .map(c => ({
        path: c.file.replace("./", ""),
        line: c.line,
        side: "RIGHT",
        body: `🤖 **Análise do Agente de Qualidade**:\n\n${c.message}`
      }));

    if (reviewComments.length > 0) {
      try {
        await octokit.pulls.createReview({
          owner,
          repo,
          pull_number,
          event: "COMMENT",
          comments: reviewComments
        });
        console.log("✅ Sugestões inline postadas com sucesso no GitHub.");
      } catch (reviewError) {
        console.log("❌ Falha na API Rest do GitHub para Inline Comments:", reviewError.message);
        
        let summaryMessage = "### 🤖 Agente de Qualidade (Resumo de Falhas)\n\n*Nota: As sugestões abaixo não puderam integrar nas linhas do arquivo.*\n\n";
        comments.forEach(c => {
          summaryMessage += `- **${c.file}:${c.line}**: \n${c.message}\n\n`;
        });
        await octokit.issues.createComment({ owner, repo, issue_number: pull_number, body: summaryMessage });
      }
    }

  } catch (error) {
    console.error("Erro no processamento:", error);
  }
}

runReview();
