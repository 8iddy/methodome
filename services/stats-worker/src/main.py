from fastapi import FastAPI, HTTPException, Request
from workers import WorkerEntrypoint, asgi

from queue_worker import PermanentAnalysisError, mark_failed, process_analysis_message
from stats import harmonise_append, profile_csv, run_analysis

app = FastAPI(title="Methodome Statistics Worker", docs_url=None, redoc_url=None)


@app.get("/health")
async def health():
    return {"service": "methodome-stats", "status": "ok", "engine": "python"}


@app.post("/profile")
async def profile(request: Request):
    try:
        payload = await request.json()
        csv_text = payload.get("csv")
        if not isinstance(csv_text, str):
            raise ValueError("csv is required.")
        return profile_csv(csv_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Dataset profiling failed.") from exc


@app.post("/harmonise/append")
async def append_harmonised(request: Request):
    try:
        payload = await request.json()
        return harmonise_append(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Dataset harmonisation failed.") from exc


@app.post("/run")
async def run(request: Request):
    try:
        payload = await request.json()
        return run_analysis(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Statistical execution failed.") from exc


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await asgi.fetch(app, request, self.env)

    async def queue(self, batch):
        for message in batch.messages:
            try:
                await process_analysis_message(message.body, self.env)
                message.ack()
            except PermanentAnalysisError as exc:
                await mark_failed(message.body, self.env, str(exc))
                message.ack()
            except Exception as exc:
                attempts = int(getattr(message, "attempts", 1) or 1)
                print(f"Transient analysis queue failure on attempt {attempts}: {exc}")
                if attempts >= 3:
                    await mark_failed(
                        message.body,
                        self.env,
                        f"Analysis execution failed after {attempts} attempts: {exc}",
                    )
                    message.ack()
                else:
                    message.retry()
