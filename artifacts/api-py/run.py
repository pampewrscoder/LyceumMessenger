"""Entry point — run with: python run.py"""
import os
import uvicorn

port = int(os.environ.get("PORT", 8082))
uvicorn.run("artifacts.api-py.main:app", host="0.0.0.0", port=port, reload=True)
