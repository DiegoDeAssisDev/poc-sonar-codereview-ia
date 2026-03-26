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
  console.log(`Iniciando revisão para PR #${pull_number}`);

  const diff = await getDiff();

  if (!diff || diff.trim().length === 0) {
    console.log("Nenhuma alteração encontrada.");
    return;
  }

  const prompt = `
Você é um Desenvolvedor Senior Flutter e revisor de código Dart experiente.

Analise o seguinte diff de uma Pull Request e sugira melhorias.

Foque em:
- Bugs e problemas de segurança
- Boas práticas Flutter/Dart
- Clean Code
- Performance

Responda APENAS com JSON válido no formato:

{
  "feedback": [
    {
      "file": "caminho/do/arquivo.dart",
      "line": 10,
      "message": "Comentário aqui"
    }
  ]
}

Se não houver problemas, retorne:

{
  "feedback": []
}

Git diff:
${diff}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você é um revisor técnico preciso. Sempre responde em JSON válido sem texto adicional."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0].message.content;

    let result;
    try {
      result = JSON.parse(raw);
    } catch (e) {
      console.error("❌ Erro ao parsear resposta da IA:", raw);
      return;
    }

    console.log("Result:", result);

    const comments = Array.isArray(result.feedback)
      ? result.feedback.map(c => ({
        file: c.file || "unknown",
        line: c.line || 0,
        message: c.message || "Sem mensagem"
      }))
      : [];

    if (comments.length === 0) {
      console.log("✅ IA não encontrou problemas.");
      return;
    }

    console.log(`⚠️ IA encontrou ${comments.length} problemas`);

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

    console.log("✅ Comentário postado no PR");
  } catch (error) {
    console.error("❌ Erro na execução:", error);
  }
}

runReview();