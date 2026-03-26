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
  console.log(`Iniciando revisão para a PR #${pull_number} em ${owner}/${repo}`);

  const diff = await getDiff();
  if (!diff) {
    console.log("Nenhuma alteração encontrada para revisão.");
    return;
  }

  console.log("Diff: ", diff);

  const prompt = `
  Você é um Desenvolvedor Senior Flutter e revisor de código Dart experiente.
  Analise o seguinte Diff do Git de uma Pull Request e sugira melhorias.
  
  Foque em:
  - Bugs óbvios ou problemas de segurança em Dart/Flutter.
  - Melhores práticas de Flutter (Stateless vs Stateful, uso de BuildContext, etc).
  - Clean Code, legibilidade e padrões de projeto (Provider, Bloc, GetX, etc).
  - Performance (evitar builds desnecessários, const constructors).

  Responda APENAS com um objeto JSON no seguinte formato:
  [
    {
      "file": "caminho/do/arquivo.js",
      "line": 10,
      "message": "Sugestão de comentário aqui."
    }
  ]

  Git Diff:
  ${diff}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Você é um revisor de código técnico muito preciso que responde em português e no formato JSON solicitado." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    console.log("Completion: ", completion);

    const result = JSON.parse(completion.choices[0].message.content);

    console.log("Result: ", result);

    const comments = Array.isArray(result.Result.feedback) ? result.Result.feedback : [];

    console.log("Comments: ", comments);

    if (comments.length === 0) {
      console.log("IA não encontrou problemas significativos.");
      return;
    }

    console.log(`IA sugeriu ${comments.length} comentários.`);

    // Em uma POC real, postaríamos os comentários via octokit.pulls.createReview
    // Mas para simplificar a visualização inicial, vamos postar um comentário geral
    let summaryMessage = "### 🤖 AI Code Review Summary\n\n";
    comments.forEach(c => {
      summaryMessage += `- **${c.file}:${c.line}**: ${c.message}\n`;
    });

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: summaryMessage
    });

    console.log("Resumo da revisão postado no GitHub.");

  } catch (error) {
    console.error("Erro no processamento da IA:", error);
  }
}

runReview();
