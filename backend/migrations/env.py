import os

from alembic import context
from sqlalchemy import create_engine

from app.config import sqlalchemy_url

config = context.config
url = sqlalchemy_url(config.attributes.get("database_url") or os.environ.get("DATABASE_URL")
                     or config.get_main_option("sqlalchemy.url"))


def run_migrations_online() -> None:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, transaction_per_migration=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
