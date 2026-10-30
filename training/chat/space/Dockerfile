# 數學解惑老師：免費的 Hugging Face Space（CPU）上跑 llama.cpp 伺服器
# 模型（GGUF）在建置時從 HauHau2010/math-tutor-qwen2.5-1.5b-GGUF 下載
FROM ghcr.io/ggml-org/llama.cpp:server
ARG MODEL_VERSION=unknown
ADD --chmod=644 https://huggingface.co/HauHau2010/math-tutor-qwen2.5-1.5b-GGUF/resolve/main/math-tutor-q8_0.gguf /models/model.gguf
ENV LLAMA_ARG_HOST=0.0.0.0 LLAMA_ARG_PORT=7860
# -c 4096：系統提示詞約 2000 token＋對話；--parallel 1：只有一個位置，系統提示詞的計算會被快取重複利用
CMD ["-m", "/models/model.gguf", "-c", "4096", "--jinja", "--parallel", "1", "-t", "2", "--no-webui"]
