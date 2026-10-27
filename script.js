
const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt");
const sendButton = document.querySelector("#send-button");
const sendLabel = document.querySelector("#send-label");
const messagesContainer = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const newChatButton = document.querySelector("#new-chat");

const levelSelect = document.querySelector("#level");
const subjectSelect = document.querySelector("#subject");
const helpModeSelect = document.querySelector("#help-mode");

let conversation = [];
let isSending = false;

// Escapa HTML para evitar que una respuesta de la IA
// inserte etiquetas HTML ejecutables.
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Corrige saltos de línea y algunas fórmulas
// LaTeX que llegan sin delimitadores.
function normalizeMarkdown(text) {
  let result = String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/&#x20;/gi, " ")
    .replace(/&nbsp;/gi, " ");

  const lines = result.split("\n");

  return lines.map((line) => {
    const trimmed = line.trim();

    // Si una línea contiene una fórmula LaTeX sin
    // delimitadores, la prepara para MathJax.
    const hasLatexCommand =
      /\\(?:frac|dfrac|tfrac|sqrt|sum|int|cdot|times|div|pi|alpha|beta|theta|leq|geq|neq|rightarrow|begin)\b/.test(trimmed);

    const hasDelimiter =
      /\\\[|\\\]|\$\$|\$|\\\(|\\\)/.test(trimmed);

    const looksLikeFormula =
      hasLatexCommand &&
      !hasDelimiter &&
      trimmed.length > 0 &&
      !/^(#{1,6}\s|[-*+]\s|>\s)/.test(trimmed);

    if (looksLikeFormula) {
      return `\\[${trimmed}\\]`;
    }

    return line;
  }).join("\n");
}

// Convierte Markdown básico en HTML.
// El texto se escapa antes de generar etiquetas HTML.
function formatMarkdown(text) {
  let source = normalizeMarkdown(text);
  const blocks = [];

  // Protege bloques de código.
  source = source.replace(
    /```([a-zA-Z0-9_-]*)[ \t]*\n?([\s\S]*?)```/g,
    (_, language, code) => {
      const index = blocks.length;
      const className = language
        ? ` class="language-${escapeHTML(language)}"`
        : "";

      blocks.push(
        `<pre class="code-block"><code${className}>${escapeHTML(
          code.replace(/\n$/, "")
        )}</code></pre>`
      );

      return `\n%%BLOCK${index}%%\n`;
    }
  );

  // Protege fórmulas de bloque para que Markdown
  // no modifique su contenido.
  source = source.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_, formula) => {
      const index = blocks.length;

      blocks.push(
        `<div class="math-block">\\[${escapeHTML(
          formula.trim()
        )}\\]</div>`
      );

      return `\n%%BLOCK${index}%%\n`;
    }
  );

  source = source.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_, formula) => {
      const index = blocks.length;

      blocks.push(
        `<div class="math-block">\\[${escapeHTML(
          formula.trim()
        )}\\]</div>`
      );

      return `\n%%BLOCK${index}%%\n`;
    }
  );

  // Protege fórmulas en línea.
  source = source.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_, formula) => {
      const index = blocks.length;

      blocks.push(
        `\\(${escapeHTML(formula.trim())}\\)`
      );

      return `%%BLOCK${index}%%`;
    }
  );

  source = source.replace(
    /(^|[^\\])\$([^$\n]+)\$/g,
    (_, before, formula) => {
      const index = blocks.length;

      blocks.push(
        `\\(${escapeHTML(formula.trim())}\\)`
      );

      return `${before}%%BLOCK${index}%%`;
    }
  );

  // Escapa el texto restante.
  let html = escapeHTML(source);

  // Fórmulas químicas comunes.
  html = html
    .replace(/\bC6H12O6\b/g, "C₆H₁₂O₆")
    .replace(/\bCO2\b/g, "CO₂")
    .replace(/\bH2O\b/g, "H₂O")
    .replace(/\bO2\b/g, "O₂")
    .replace(/\bN2\b/g, "N₂")
    .replace(/\bCH4\b/g, "CH₄")
    .replace(/\bNH3\b/g, "NH₃")
    .replace(/\bH2\b/g, "H₂")
    .replace(/\bO3\b/g, "O₃");

  // Encabezados.
  html = html
    .replace(/^######\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^#####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^##\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^#\s+(.+)$/gm, "<h2>$1</h2>");

  // Separadores.
  html = html.replace(/^[ \t]*(?:---+|\*\*\*+|___+)[ \t]*$/gm, "<hr>");

  // Código en línea.
  html = html.replace(
    /`([^`\n]+)`/g,
    "<code>$1</code>"
  );

  // Negrita.
  html = html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Cursiva.
  html = html
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

  // Convierte líneas en párrafos y listas.
  const lines = html.split("\n");
  const output = [];

  let listType = null;
  let paragraph = [];

  function closeList() {
    if (listType) {
      output.push(listType === "ul" ? "</ul>" : "</ol>");
      listType = null;
    }
  }

  function flushParagraph() {
    if (paragraph.length) {
      output.push(`<p>${paragraph.join("<br>")}</p>`);
      paragraph = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const blockMatch = trimmed.match(/^%%BLOCK(\d+)%%$/);

    if (unordered || ordered) {
      flushParagraph();

      const nextType = unordered ? "ul" : "ol";

      if (listType !== nextType) {
        closeList();
        output.push(nextType === "ul" ? "<ul>" : "<ol>");
        listType = nextType;
      }

      output.push(`<li>${(unordered || ordered)[1]}</li>`);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    if (blockMatch) {
      flushParagraph();
      closeList();
      output.push(`%%BLOCK${blockMatch[1]}%%`);
      continue;
    }

    if (/^<h[234]>/.test(trimmed) || /^<hr>$/.test(trimmed)) {
      flushParagraph();
      closeList();
      output.push(trimmed);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();

  // Restaura los bloques protegidos.
  return output.join("\n").replace(
    /%%BLOCK(\d+)%%/g,
    (_, index) => blocks[Number(index)] || ""
  );
}

// Procesa las fórmulas matemáticas dentro de un elemento.
// Si MathJax aún está cargando, espera a que esté listo.
async function renderMath(element) {
  if (!element || !window.MathJax) return;

  try {
    await MathJax.startup.promise;

    if (typeof MathJax.typesetPromise === "function") {
      await MathJax.typesetPromise([element]);
    }
  } catch (error) {
    console.error("No se pudieron representar las fórmulas:", error);
  }
}

// Agrega un mensaje al chat.
function addMessage(role, text) {
  const message = document.createElement("article");
  message.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "assistant" ? "✦" : "T";

  const content = document.createElement("div");
  content.className = "message-content";

  if (role === "assistant") {
    content.innerHTML = formatMarkdown(text);
    renderMath(content);
  } else {
    content.textContent = text;
  }

  message.append(avatar, content);
  messagesContainer.appendChild(message);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return message;
}

function showChat() {
  welcome.hidden = true;
  messagesContainer.hidden = false;
}

function setLoading(loading) {
  isSending = loading;
  sendButton.disabled = loading;
  promptInput.disabled = loading;
  sendLabel.textContent = loading ? "Pensando..." : "Enviar";
}

function resizeInput() {
  promptInput.style.height = "auto";
  promptInput.style.height =
    Math.min(promptInput.scrollHeight, 180) + "px";
}

// Envía el mensaje a la API de EduIA.
async function sendMessage(text) {
  const question = text.trim();

  if (!question || isSending) return;

  showChat();
  addMessage("user", question);

  conversation.push({
    role: "user",
    content: question
  });

  promptInput.value = "";
  resizeInput();
  setLoading(true);

  const typing = addMessage(
    "assistant",
    "EduIA está preparando tu respuesta..."
  );

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        level: levelSelect.value,
        subject: subjectSelect.value,
        helpMode: helpModeSelect.value,
        messages: conversation
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        typeof data.error === "string"
          ? data.error
          : data.error?.message ||
            "No se pudo obtener una respuesta.";

      throw new Error(errorMessage);
    }

    if (
      typeof data.reply !== "string" ||
      !data.reply.trim()
    ) {
      throw new Error("La IA devolvió una respuesta vacía.");
    }

    const content = typing.querySelector(".message-content");
    content.innerHTML = formatMarkdown(data.reply);

    // Renderiza las fórmulas después de insertar la respuesta.
    await renderMath(content);

    conversation.push({
      role: "assistant",
      content: data.reply
    });

  } catch (error) {
    typing.querySelector(".message-content").textContent =
      `No pude responder: ${error.message}`;

    // Elimina la pregunta fallida del historial.
    if (
      conversation.length &&
      conversation[conversation.length - 1].role === "user"
    ) {
      conversation.pop();
    }

  } finally {
    setLoading(false);
    promptInput.focus();
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// Envío del formulario.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(promptInput.value);
});

// Ajusta la altura del campo de texto.
promptInput.addEventListener("input", resizeInput);

// Enter envía; Shift + Enter crea una nueva línea.
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

// Botones de sugerencias.
document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    sendMessage(button.dataset.prompt || button.textContent);
  });
});

// Inicia una conversación nueva.
newChatButton.addEventListener("click", () => {
  if (isSending) return;

  conversation = [];
  messagesContainer.replaceChildren();
  messagesContainer.hidden = true;
  welcome.hidden = false;
  promptInput.value = "";
  resizeInput();
  promptInput.focus();
});
