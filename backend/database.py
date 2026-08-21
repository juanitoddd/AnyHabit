import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# The database location is configurable so that a self-hoster can point it at a
# bind mount, and so the test suite can run against a throwaway file.
DATA_DIR = Path(os.environ.get("ANYHABIT_DATA_DIR", "./data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = DATA_DIR / os.environ.get("ANYHABIT_DB_FILENAME", "anyhabit.db")
SQLALCHEMY_DATABASE_URL = os.environ.get("ANYHABIT_DATABASE_URL", f"sqlite:///{DATABASE_PATH}")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {},
)


if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _connection_record):
        """Enable the pragmas SQLite needs to behave well as an app database.

        ``foreign_keys`` makes the ``ON DELETE CASCADE`` declarations in
        ``models`` actually fire, and WAL keeps reads from blocking while the
        analytics endpoints churn through logs.
        """
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=5000")
        finally:
            cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
