from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, text
load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))
with engine.connect() as c:
    print("CONEXION OK:", c.execute(text("SELECT DB_NAME()")).scalar())
