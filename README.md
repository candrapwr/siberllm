# SiberLLM

**Run local AI models on your own machine — privately, simply.**

SiberLLM is a desktop application that lets you run large language models (LLMs)
and multimodal vision models entirely on your own computer, with no cloud, no API
keys, and no data leaving your machine.

It is a friendly graphical layer on top of
[llama.cpp](https://github.com/ggml-org/llama.cpp) — the fast, open-source AI
inference engine. You don't need to touch a terminal or compile anything.
SiberLLM handles installing the engine, downloading models, and starting a local
API server for you.

---

## ✨ What you can do with it

- **Run any GGUF model locally** — text chat models like Qwen, Llama, Gemma, Phi,
  and vision/multimodal models like Llama 3.2 Vision, Moondream, and MiniCPM-V.
- **One-click engine install** — if `llama.cpp` isn't installed yet, SiberLLM
  downloads the right build for your computer automatically, with a live
  progress bar.
- **Browse & download models** from [HuggingFace](https://huggingface.co), or use
  `.gguf` files you already have.
- **Multimodal support** — pair a vision model with its `mmproj` projector to
  understand images.
- **OpenAI-compatible API** — once running, SiberLLM exposes a local server
  (`http://127.0.0.1:port`) that works with any tool, script, or app that speaks
  the OpenAI API. Point your existing apps at `localhost` and they just work.
- **Built-in web UI** — open the bundled llama-server web interface with one click
  to chat with your model in the browser.
- **Everything stays private** — inference runs on your hardware. Nothing is sent
  to a remote server.

---

## 🖥️ Supported platforms

| OS | Acceleration |
|---|---|
| macOS (Apple Silicon & Intel) | Metal (GPU) |
| Windows | CPU, CUDA (NVIDIA), or Vulkan |
| Linux | CPU, CUDA, or Vulkan |

---

## 🚀 Getting started

1. **Download** the latest SiberLLM release for your platform
   (`.dmg` for macOS, `.exe` for Windows, `.AppImage`/`.deb` for Linux).
2. **Install & launch** SiberLLM.
3. On first launch, go to **Setup** and click **"Install llama.cpp"**.
   SiberLLM detects your hardware and downloads the best build automatically.
4. Go to **Models** → **Download** tab and pick a model (start small if unsure —
   e.g. a 3B model runs well on most computers).
5. Go to **Run**, select your model, and click **Start**.
6. When the server is ready, click **"Open Web UI"** to chat, or copy the
   `http://127.0.0.1:port/v1/chat/completions` URL into any OpenAI-compatible app.

That's it — you now have a local, private AI server.

---

## 📖 The five sections

| Section | What it's for |
|---|---|
| **Setup** | Install or update the llama.cpp engine. Shows version & GPU backend. |
| **Models** | Manage local `.gguf` files, or browse/download from HuggingFace. |
| **Run** | Choose a model + (optional) vision projector, set parameters, start the server. |
| **Logs** | Watch the live output of the running server. |
| **Settings** | Defaults for the server (port, GPU layers, context size), and extra model folders. |

---

## 🔌 Using the local API

Once a server is running, it speaks the OpenAI Chat Completions API.
Example with `curl`:

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local",
    "messages": [{"role": "user", "content": "Hello! Who are you?"}]
  }'
```

You can also point tools like **Open WebUI**, **Continue**, **LangChain**,
**AnythingLLM**, and most OpenAI-compatible clients at
`http://127.0.0.1:8080/v1` — just use any string as the API key.

---

## ❓ FAQ

**Do I need an internet connection?**
Only to download the engine and models the first time. After that, inference is
fully offline.

**What hardware do I need?**
It depends on the model size. Small models (3B) run on most modern laptops.
Larger models (9B+) benefit from a dedicated GPU or an Apple Silicon Mac with
ample unified memory. The app auto-detects your GPU and picks the fastest backend.

**Is my data sent anywhere?**
No. All inference happens locally on your machine. The only network requests are
downloads from `github.com` (engine) and `huggingface.co` (models), and the local
server only listens on `127.0.0.1` (your own computer).

**Where are my models stored?**
In the app's data folder, under `siberllm/models/`. See Settings to add extra
folders you already keep models in.

---

## 📝 License

MIT — SiberLLM is free and open source. It is built on top of the amazing
[llama.cpp](https://github.com/ggml-org/llama.cpp) project.

---

For development, architecture, and contributing details, see
[DEVELOPMENT.md](./DEVELOPMENT.md).
