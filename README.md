# PaperMind — AI Research Paper Assistant

PaperMind is a React + Vite application with a server-side Node API. It extracts text from uploaded PDFs, indexes page-level chunks for retrieval, and uses an LLM only with the most relevant passages. Answers cite the real source pages.

## Features

- PDF upload with type, size (30 MB), and empty/corrupt document validation
- Page-aware text extraction and retrieval-based Q&A
- AI answers that are instructed to stay grounded in the uploaded paper
- Quick summary, methodology, dataset, limitations, conclusion, keywords, questions, simple explanation, and insights tools
- Responsive chat workspace with suggested questions, follow-up context, source-page chips, and document replacement

## Run locally

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the Vite URL (usually `http://localhost:5173`).

The app never sends API keys to the browser. The key is read only by the API server.

## Deploy to Vercel

1. Import this GitHub repository into Vercel.
2. Add `OPENAI_API_KEY` as an encrypted Environment Variable for Production, Preview, and Development.
3. Optionally set `OPENAI_MODEL` (defaults to `gpt-4o-mini`).
4. Deploy.

### Important production storage note

The included serverless implementation retains an uploaded document in the active serverless process, which is ideal for short, private research sessions. For durable multi-user storage, wire the document metadata and chunks to a managed database/vector store (for example Vercel Postgres plus pgvector) and place original PDFs in private Blob storage. Do not store uploads or API keys in Git.

## API

- `POST /api/upload` — multipart PDF upload
- `POST /api/chat` — `{ documentId, question, history }`
- `GET /api/document/:id` — session metadata
- `POST /api/tools/:id` — `{ tool }`
- `DELETE /api/document/:id` — remove session data

