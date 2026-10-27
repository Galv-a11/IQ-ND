
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Modelos alternativos: deben estar disponibles para tu API key.
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
];

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isTemporaryError(error) {
  const status = Number(error?.status ?? error?.code);
  const message = String(error?.message || "").toLowerCase();

  return (
    [408, 429, 500, 502, 503, 504].includes(status) ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("not found")
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido. Usá POST.",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Falta configurar GEMINI_API_KEY en Vercel.",
    });
  }

  try {
    const {
      level = "Secundaria",
      subject = "General",
      helpMode = "explicacion",
      messages = [],
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "No se recibieron mensajes para responder.",
      });
    }

    const modeDescriptions = {
      explicacion:
        "Explicá los temas paso a paso, con ejemplos claros y sencillos.",
      ejercicios:
        "Ayudá a resolver ejercicios paso a paso y explicá el razonamiento.",
      resumen:
        "Prepará resúmenes organizados, claros y fáciles de estudiar.",
      examen:
        "Hacé preguntas de práctica, corregí las respuestas y explicá los errores.",
    };

    const systemInstruction = `
Sos EduIA, una inteligencia artificial educativa general,
amable, paciente y clara.

Podés ayudar con matemática, ciencias, historia, geografía,
idiomas, programación, literatura y otras asignaturas.

CONTEXTO DEL ESTUDIANTE:
- Nivel educativo: ${level}
- Asignatura seleccionada: ${subject}
- Modo de ayuda: ${helpMode}

INSTRUCCIONES DEL MODO:
${modeDescriptions[helpMode] ||
  "Explicá los temas de forma clara, educativa y organizada."}

REGLAS IMPORTANTES:
1. Respondé en español, salvo que el estudiante pida otro idioma.
2. Adaptá el vocabulario y la profundidad al nivel educativo.
3. Respondé primero la pregunta concreta del estudiante.
4. Usá ejemplos, analogías y explicaciones paso a paso cuando ayuden.
5. Priorizá la asignatura seleccionada, pero respondé otras preguntas
   si el estudiante cambia de tema.
6. No afirmes que tu especialidad es exclusivamente matemática.
7. No inventes datos. Si no estás seguro, reconocelo.
8. Mantené la precisión científica aunque expliques de forma sencilla.
9. Por ejemplo, al explicar las células, aclar á que las células
   eucariotas tienen núcleo, mientras que las procariotas no.
10. No agregues preguntas o sugerencias de otras asignaturas
    que no sean relevantes para la conversación.
11. Mantené el contexto de los mensajes anteriores.
12. En modo examen, fomentá la práctica y explicá los errores.
13. En modo ejercicios, mostr á el procedimiento y su razonamiento
    de forma comprensible.
14. En modo resumen, organizá la información por conceptos clave.
`;

    // Adaptamos el historial al formato de Gemini.
    const contents = messages
      .filter((message) => {
        const messageText = message?.content ?? message?.text;

        return (
          message &&
          ["user", "assistant", "model"].includes(message.role) &&
          typeof messageText === "string" &&
          messageText.trim().length > 0
        );
      })
      .map((message) => ({
        role: message.role === "assistant" ? "model" : message.role,
        parts: [
          {
            text: message.content ?? message.text,
          },
        ],
      }));

    // Gemini espera que el historial comience con un mensaje del usuario.
    while (contents.length > 0 && contents[0].role !== "user") {
      contents.shift();
    }

    if (contents.length === 0) {
      return res.status(400).json({
        error: "No se encontró una pregunta válida del usuario.",
      });
    }

    let lastError = null;

    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          });

          const reply = response.text;

          if (typeof reply === "string" && reply.trim()) {
            return res.status(200).json({ reply });
          }

          lastError = new Error(
            `El modelo ${model} no devolvió texto.`
          );

          break;
        } catch (error) {
          lastError = error;

          console.error(
            `Error con ${model}, intento ${attempt + 1}:`,
            error?.message || error
          );

          if (!isTemporaryError(error)) {
            throw error;
          }

          if (attempt === 0) {
            await sleep(1000);
          }
        }
      }
    }

    console.error("Todos los modelos fallaron:", lastError);

    return res.status(503).json({
      error:
        "Gemini está temporalmente ocupado o se alcanzó un límite de uso. Esperá unos segundos y probá nuevamente.",
    });
  } catch (error) {
    console.error("Error en EduIA:", error);

    const status = Number(error?.status ?? error?.code);

    return res.status(
      [400, 401, 403, 429].includes(status) ? status : 500
    ).json({
      error:
        error?.message ||
        "Ocurrió un error al consultar Gemini.",
    });
  }
}
