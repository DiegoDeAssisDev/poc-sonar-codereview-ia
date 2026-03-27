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
    console.error(`Erro ao pegar diff:`, error);
    return "";
  }
}

async function runReview() {
  console.log(`🚀 Review PR #${pull_number}`);

  const diff = await getDiff();

  if (!diff || diff.trim().length === 0) {
    console.log("Nenhuma alteração encontrada.");
    return;
  }

  const prompt = `
Você é um Desenvolvedor Senior Flutter.

Analise o git diff abaixo (no formato Unified Diff) e gere sugestões de Code Review.

# REGRA MATEMÁTICA CRÍTICA PARA NÚMERO DE LINHAS (Line Numbers):
A IA TEM MUITA DIFICULDADE EM ACERTAR NÚMEROS DE LINHAS. Para corrigir isso, você deve seguir esta regra matemática estritamente:
1. Encontre o cabeçalho do bloco (Hunk Header) mais próximo ACIMA da linha que você quer comentar. Exemplo: \`@@ -old_start,old_count +new_start,new_count @@\`
2. Pegue o valor de \`new_start\` (o número logo após o sinal de \`+\`). Exemplo: em \`@@ -10,5 +15,6 @@\`, o \`new_start\` é 15.
3. Conte quantas linhas existem DEPOIS do cabeçalho até chegar na linha do erro, EXCLUINDO as linhas que começam com \`-\` (deleções).
4. O número real da linha = \`new_start\` + o número de linhas contadas (apenas as que começam com \` \` ou \`+\`).
5. Se o erro estiver na exata primeira linha do bloco (aquela logo abaixo do \`@@\`), se ela for uma adição (\`+\`) ou contexto (\` \`), a linha é exatamente o \`new_start\`.

Responda APENAS com JSON válido, sem markdown:

{
  "feedback": [
    {
      "file": "lib/arquivo.dart",
      "line": 15,
      "message": "comentário técnico focado em Flutter"
    }
  ]
}

Se não houver problemas:
{ "feedback": [] }

Diff:
${diff}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você responde apenas JSON válido e nunca adiciona texto fora do JSON."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0].message.content;

    let result;
    try {
      result = JSON.parse(raw);
    } catch (e) {
      console.error("Erro parse JSON:", raw);
      return;
    }

    const comments = Array.isArray(result.feedback)
      ? result.feedback.map(c => ({
        file: (c.file || "").replace("./", ""),
        line: c.line || 1,
        message: c.message || "Sem mensagem"
      }))
      : [];

    if (comments.length === 0) {
      console.log("✅ Nenhum problema encontrado.");
      return;
    }

    console.log(`⚠️ ${comments.length} comentários encontrados`);

    // =========================
    // 💬 1. COMENTÁRIO GERAL
    // =========================
    let summary = "### 🤖 AI Code Review\n\n";

    comments.forEach(c => {
      summary += `- **${c.file}:${c.line}** → ${c.message}\n`;
    });

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: summary
    });

    console.log("✅ Comentário geral enviado");

    // =========================
    // 📍 2. COMENTÁRIOS INLINE
    // =========================
    const reviewComments = comments
      .filter(c => c.file && c.line)
      .map(c => ({
        path: c.file,
        line: c.line,
        side: "RIGHT",
        body: `🤖 ${c.message}`
      }));

    if (reviewComments.length > 0) {
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number,
        event: "COMMENT",
        comments: reviewComments
      });

      console.log("✅ Comentários inline enviados");
    }

  } catch (error) {
    console.error("Erro geral:", error);
  }
}

runReview();