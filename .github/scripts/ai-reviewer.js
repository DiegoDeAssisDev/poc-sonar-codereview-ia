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

Analise o diff abaixo e gere sugestões.

Responda APENAS com JSON válido:

{
  "feedback": [
    {
      "file": "lib/arquivo.dart",
      "line": 10,
      "message": "comentário"
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