from fastapi import FastAPI, HTTPException, Request
from workers import asgi

from stats import run_analysis

app = FastAPI(title="Methodome Statistics Worker", docs_url=None, redoc_url=None)


@app.get("/health")
async def health():
    return {"service": "methodome-stats", "status": "ok", "engine": "python"}


@app.post("/run")
async def run(request: Request):
    try:
        payload = await request.json()
        return run_analysis(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Statistical execution failed.") from exc


Default = asgi.entrypoint(app)
