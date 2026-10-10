"use strict";

const PROVIDERS = {
  openai: {
    label: "OpenAI",
    models: [
      { id: "gpt-4o-mini", label: "gpt-4o-mini" },
      { id: "gpt-4o", label: "gpt-4o" },
      { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
      { id: "gpt-4.1", label: "gpt-4.1" },
      { id: "o4-mini", label: "o4-mini (raisonnement)" }
    ],
    keyUrl: "https://platform.openai.com/api-keys",
    listModels: (cfg) => fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": "Bearer " + cfg.apiKey }
    }).then((r) => r.json()).then((d) => (d.data || []).map((m) => m.id)),
    build: (cfg, messages) => ({
      url: "https://api.openai.com/v1/chat/completions",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, messages: messages, stream: true, max_tokens: 300 })
      }
    }),
    parse: (evt) => {
      if (evt.error) return null;
      const d = evt.choices && evt.choices[0];
      if (!d) return null;
      if (d.finish_reason) return "";
      return (d.delta && d.delta.content) || "";
    }
  },

  anthropic: {
    label: "Anthropic",
    models: [
      { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
      { id: "claude-opus-4-1", label: "claude-opus-4-1" },
      { id: "claude-3-5-haiku-latest", label: "claude-3-5-haiku" },
      { id: "claude-3-7-sonnet-latest", label: "claude-3-7-sonnet" }
    ],
    keyUrl: "https://console.anthropic.com/settings/keys",
    listModels: (cfg) => fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" }
    }).then((r) => r.json()).then((d) => (d.data || []).map((m) => m.id).filter(isChatModel)),
    // Anthropic n'accepte pas la propriete "system" dans le tableau de messages :
    // le prompt systeme passe dans un champ dedie en tete de corps.
    build: (cfg, messages) => {
      const sys = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
      const rest = messages.filter(m => m.role !== "system");
      return {
        url: "https://api.anthropic.com/v1/messages",
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: cfg.model,
            max_tokens: 300,
            system: sys,
            messages: rest,
            stream: true
          })
        }
      };
    },
    parse: (evt) => {
      if (evt.type === "error") {
        const msg = evt.error && evt.error.message ? evt.error.message : "erreur Anthropic";
        throw new Error(msg);
      }
      if (evt.type !== "content_block_delta") return null;
      return (evt.delta && evt.delta.text) || "";
    }
  },

  gemini: {
    label: "Gemini",
    models: [
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { id: "gemini-2.0-flash", label: "gemini-2.0-flash" }
    ],
    keyUrl: "https://aistudio.google.com/app/apikey",
    listModels: (cfg) => fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(cfg.apiKey)
    ).then((r) => r.json()).then((d) => (d.models || [])
      // L'API liste aussi les modèles d'embedding et d'image : on ne garde que
      // ceux qui savent générer du texte.
      .filter((m) => (m.supportedGenerationMethods || []).indexOf("generateContent") !== -1)
      .map((m) => String(m.name || "").replace(/^models\//, ""))),
    build: (cfg, messages) => {
      // Gemini a le prompt systeme dans systemInstruction, et "model" dans l'URL.
      const sys = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
      const rest = messages
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const body = { contents: rest, generationConfig: { maxOutputTokens: 300 } };
      if (sys) body.systemInstruction = { parts: [{ text: sys }] };
      const url = "https://generativelanguage.googleapis.com/v1beta/models/"
        + encodeURIComponent(cfg.model) + ":streamGenerateContent?alt=sse&key="
        + encodeURIComponent(cfg.apiKey);
      return { url: url, init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } };
    },
    parse: (evt) => {
      if (evt.error) throw new Error(evt.error.message || "erreur Gemini");
      const c = evt.candidates && evt.candidates[0];
      if (!c || !c.content || !c.content.parts) return null;
      let out = "";
      for (const p of c.content.parts) if (p.text) out += p.text;
      return out;
    }
  },

  openrouter: {
    label: "OpenRouter",
    models: [
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" }
    ],
    keyUrl: "https://openrouter.ai/keys",
    listModels: (cfg) => fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Authorization": "Bearer " + cfg.apiKey }
    }).then((r) => r.json()).then((d) => (d.data || [])
      // Le catalogue OpenRouter contient aussi l'embedding et l'image.
      .filter((m) => (m.architecture && m.architecture.modality) === "text->text")
      .map((m) => m.id)
      .sort()),
    build: (cfg, messages) => ({
      url: "https://openrouter.ai/api/v1/chat/completions",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + cfg.apiKey,
          "HTTP-Referer": location.origin,
          "X-Title": "Samaritain"
        },
        body: JSON.stringify({ model: cfg.model, messages: messages, stream: true, max_tokens: 300 })
      }
    }),
    parse: (evt) => {
      if (evt.error) throw new Error(evt.error.message || "erreur OpenRouter");
      const d = evt.choices && evt.choices[0];
      if (!d) return null;
      if (d.finish_reason) return "";
      return (d.delta && d.delta.content) || "";
    }
  },

  groq: {
    label: "Groq",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" }
    ],
    keyUrl: "https://console.groq.com/keys",
    listModels: (cfg) => fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": "Bearer " + cfg.apiKey }
    }).then((r) => r.json()).then((d) => (d.data || []).map((m) => m.id)),
    build: (cfg, messages) => ({
      url: "https://api.groq.com/openai/v1/chat/completions",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, messages: messages, stream: true, max_tokens: 300 })
      }
    }),
    parse: (evt) => {
      if (evt.error) throw new Error(evt.error.message || "erreur Groq");
      const d = evt.choices && evt.choices[0];
      if (!d) return null;
      if (d.finish_reason) return "";
      return (d.delta && d.delta.content) || "";
    }
  }
};

// Anthropic expose aussi des modèlesvisions et des modèles de completion : le
// point de terminaison messages n'accepte que les modèles de texte.
function isChatModel(id) {
  return !/^(claude-.*-(vision|ocr)|.*-v[0-9]+:.*)$/.test(String(id))
    && /claude/.test(String(id));
}

// Un lot SSE peut etre coupe en plein milieu : on garde le reste du tampon.
// parseText est fourni par l'appelant : le module ne depend d'aucune variable
// globale, ce qui le rend reutilisable quel que soit le fournisseur actif.
function readSseStream(body, parseText, onText) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  return (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Les evenements sont separes par une ligne vide.
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        for (const rawLine of part.split("\n")) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          // "[DONE]" termine le flux chez OpenAI, Groq et OpenRouter.
          if (payload === "[DONE]") return full;
          if (!payload) continue;
          let evt;
          try { evt = JSON.parse(payload); } catch (e) { continue; }
          const text = parseText(evt);
          if (text) {
            full += text;
            onText(full);
          }
        }
      }
    }
    return full;
  })();
}

if (typeof window !== "undefined") {
  window.PROVIDERS = PROVIDERS;
  window.readSseStream = readSseStream;
  window.isChatModel = isChatModel;
}
